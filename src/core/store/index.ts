import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../shared/logger.js";
import { StoreNotInitializedError } from "../../shared/errors.js";
import type {
  Deal,
  Category,
  Location,
  Merchant,
  SearchResult,
} from "../types/deal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "schema.sql");

/**
 * Thin, synchronous wrapper around better-sqlite3 + sqlite-vec.
 *
 * Owns the lifecycle of the SQLite connection plus the row → domain
 * type mapping. Used by every core/* module — no MCP or CLI concerns.
 */
export class DealStore {
  private readonly db: Database.Database;

  constructor(sqlitePath: string, options: { applySchema?: boolean } = {}) {
    if (!existsSync(sqlitePath) && options.applySchema !== true) {
      throw new StoreNotInitializedError(sqlitePath);
    }

    this.db = new Database(sqlitePath, { fileMustExist: false });
    this.db.pragma("journal_mode = WAL");

    // Load sqlite-vec extension before any query touches deal_vectors.
    sqliteVec.load(this.db);

    if (options.applySchema) {
      const schema = readFileSync(SCHEMA_PATH, "utf-8");
      this.db.exec(schema);
      logger.info({ sqlitePath }, "Applied schema");
    }
  }

  close(): void {
    this.db.close();
  }

  // ---- Deals -------------------------------------------------------------

  getDealById(id: string): Deal | null {
    const row = this.db
      .prepare(`SELECT * FROM deals WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.toDeal(row) : null;
  }

  getDealByUrl(url: string): Deal | null {
    const row = this.db
      .prepare(`SELECT * FROM deals WHERE url = ?`)
      .get(url) as Record<string, unknown> | undefined;
    return row ? this.toDeal(row) : null;
  }

  listDeals(filters: {
    categorySlug?: string;
    locationSlug?: string;
    merchantId?: string;
    maxPriceCents?: number;
    minRating?: number;
    limit?: number;
  } = {}): Deal[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.categorySlug) {
      where.push(`category_slug = @categorySlug`);
      params.categorySlug = filters.categorySlug;
    }
    if (filters.locationSlug) {
      where.push(`location_slug = @locationSlug`);
      params.locationSlug = filters.locationSlug;
    }
    if (filters.merchantId) {
      where.push(`merchant_id = @merchantId`);
      params.merchantId = filters.merchantId;
    }
    if (filters.maxPriceCents !== undefined) {
      where.push(`price_cents IS NOT NULL AND price_cents <= @maxPriceCents`);
      params.maxPriceCents = filters.maxPriceCents;
    }
    if (filters.minRating !== undefined) {
      where.push(`rating IS NOT NULL AND rating >= @minRating`);
      params.minRating = filters.minRating;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const rows = this.db
      .prepare(
        `SELECT * FROM deals ${whereSql} ORDER BY discount_pct DESC NULLS LAST, rating DESC NULLS LAST LIMIT ${limit}`,
      )
      .all(params) as Record<string, unknown>[];
    return rows.map((r) => this.toDeal(r));
  }

  countDeals(filters: {
    categorySlug?: string;
    locationSlug?: string;
    merchantId?: string;
  } = {}): number {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.categorySlug) {
      where.push(`category_slug = @categorySlug`);
      params.categorySlug = filters.categorySlug;
    }
    if (filters.locationSlug) {
      where.push(`location_slug = @locationSlug`);
      params.locationSlug = filters.locationSlug;
    }
    if (filters.merchantId) {
      where.push(`merchant_id = @merchantId`);
      params.merchantId = filters.merchantId;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM deals ${whereSql}`)
      .get(params) as { n: number };
    return row.n;
  }

  // ---- Vector search -----------------------------------------------------

  /**
   * KNN search with optional filters. sqlite-vec ranks by L2 distance;
   * we convert to a similarity score in [0,1] by `1 / (1 + distance)`.
   * Filters are applied on the deals join — so post-filter, the limit
   * applies BEFORE filtering. We compensate by KNN-ing a wide K then
   * narrowing.
   */
  searchByEmbedding(
    embedding: number[],
    options: {
      limit?: number;
      categorySlug?: string;
      locationSlug?: string;
      merchantId?: string;
      maxPriceCents?: number;
      minRating?: number;
    } = {},
  ): SearchResult[] {
    const limit = options.limit ?? 10;
    const wideK = Math.max(limit * 4, 40); // overshoot to leave room for filters

    const where: string[] = [];
    const params: Record<string, unknown> = { wideK };
    if (options.categorySlug) {
      where.push(`d.category_slug = @categorySlug`);
      params.categorySlug = options.categorySlug;
    }
    if (options.locationSlug) {
      where.push(`d.location_slug = @locationSlug`);
      params.locationSlug = options.locationSlug;
    }
    if (options.merchantId) {
      where.push(`d.merchant_id = @merchantId`);
      params.merchantId = options.merchantId;
    }
    if (options.maxPriceCents !== undefined) {
      where.push(`d.price_cents IS NOT NULL AND d.price_cents <= @maxPriceCents`);
      params.maxPriceCents = options.maxPriceCents;
    }
    if (options.minRating !== undefined) {
      where.push(`d.rating IS NOT NULL AND d.rating >= @minRating`);
      params.minRating = options.minRating;
    }
    const whereSql = where.length ? `AND ${where.join(" AND ")}` : "";

    const rows = this.db
      .prepare(
        `SELECT d.*, dv.distance AS distance
         FROM deal_vectors dv
         JOIN deals d ON d.id = dv.deal_id
         WHERE dv.embedding MATCH ? AND k = @wideK
         ${whereSql}
         ORDER BY dv.distance
         LIMIT ${limit}`,
      )
      .all(new Float32Array(embedding), params) as Record<string, unknown>[];

    return rows.map((r) => {
      const deal = this.toDeal(r);
      const distance = Number(r.distance ?? 0);
      const similarity = 1 / (1 + distance);
      return { ...deal, similarity };
    });
  }

  getEmbedding(dealId: string): number[] | null {
    const row = this.db
      .prepare(`SELECT embedding FROM deal_vectors WHERE deal_id = ?`)
      .get(dealId) as { embedding: Buffer } | undefined;
    if (!row) return null;
    const buf = row.embedding;
    const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(float32);
  }

  // ---- Categories / Locations / Merchants --------------------------------

  listCategories(): Category[] {
    const rows = this.db
      .prepare(`SELECT slug, name, deal_count FROM categories ORDER BY deal_count DESC, slug ASC`)
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      slug: String(r.slug),
      name: String(r.name),
      dealCount: Number(r.deal_count ?? 0),
    }));
  }

  listLocations(): Location[] {
    const rows = this.db
      .prepare(`SELECT slug, name, deal_count FROM locations ORDER BY deal_count DESC, slug ASC`)
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      slug: String(r.slug),
      name: String(r.name),
      dealCount: Number(r.deal_count ?? 0),
    }));
  }

  listMerchants(
    options: { limit?: number; sort?: "dealCount" | "rating" | "name" } = {},
  ): Merchant[] {
    const limit = Math.max(1, Math.min(500, options.limit ?? 100));
    const sort = options.sort ?? "dealCount";
    const orderBy =
      sort === "name"
        ? `name ASC`
        : sort === "rating"
        ? `rating_avg DESC NULLS LAST, deal_count DESC`
        : `deal_count DESC, name ASC`;
    const rows = this.db
      .prepare(
        `SELECT id, name, rating_avg, deal_count FROM merchants ORDER BY ${orderBy} LIMIT ${limit}`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
      dealCount: Number(r.deal_count ?? 0),
    }));
  }

  countMerchants(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM merchants`)
      .get() as { n: number };
    return row.n;
  }

  getMerchant(id: string): Merchant | null {
    const row = this.db
      .prepare(`SELECT id, name, rating_avg, deal_count FROM merchants WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
      dealCount: Number(row.deal_count ?? 0),
    };
  }

  schemaVersion(): string | null {
    const row = this.db
      .prepare(`SELECT value FROM schema_meta WHERE key = 'version'`)
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  // ---- Row mapping -------------------------------------------------------

  private toDeal(row: Record<string, unknown>): Deal {
    return {
      id: String(row.id),
      url: String(row.url),
      title: String(row.title),
      description: row.description === null ? null : String(row.description),
      merchantId: row.merchant_id === null ? null : String(row.merchant_id),
      merchantName: row.merchant_name === null ? null : String(row.merchant_name),
      categorySlug: String(row.category_slug),
      locationSlug: String(row.location_slug),
      priceCents: row.price_cents === null ? null : Number(row.price_cents),
      originalPriceCents:
        row.original_price_cents === null ? null : Number(row.original_price_cents),
      discountPct: row.discount_pct === null ? null : Number(row.discount_pct),
      rating: row.rating === null ? null : Number(row.rating),
      reviewsCount: row.reviews_count === null ? null : Number(row.reviews_count),
      imageUrl: row.image_url === null ? null : String(row.image_url),
      scrapedAt: String(row.scraped_at),
    };
  }
}
