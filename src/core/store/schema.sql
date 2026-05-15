-- groupon-deal-intelligence — SQLite schema
--
-- Single canonical schema applied at boot. better-sqlite3 runs this
-- against the database file pointed at by SQLITE_PATH, idempotent via
-- IF NOT EXISTS.
--
-- The deal_vectors virtual table requires the sqlite-vec extension to
-- be loaded by the connection before this file is executed.

-- ----------------------------------------------------------------------
-- Lookup tables
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  deal_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  deal_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS merchants (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  rating_avg   REAL,
  deal_count   INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------
-- Core deals table
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deals (
  id                      TEXT PRIMARY KEY,
  url                     TEXT NOT NULL UNIQUE,
  title                   TEXT NOT NULL,
  description             TEXT,
  merchant_id             TEXT,
  merchant_name           TEXT,
  category_slug           TEXT NOT NULL,
  location_slug           TEXT NOT NULL,
  price_cents             INTEGER,
  original_price_cents    INTEGER,
  discount_pct            INTEGER,
  rating                  REAL,
  reviews_count           INTEGER,
  image_url               TEXT,
  scraped_at              TEXT NOT NULL,         -- ISO 8601 string
  raw_json                TEXT,                  -- original blob for reproducibility
  FOREIGN KEY (category_slug) REFERENCES categories(slug),
  FOREIGN KEY (location_slug) REFERENCES locations(slug),
  FOREIGN KEY (merchant_id)   REFERENCES merchants(id)
);

CREATE INDEX IF NOT EXISTS idx_deals_category    ON deals(category_slug);
CREATE INDEX IF NOT EXISTS idx_deals_location    ON deals(location_slug);
CREATE INDEX IF NOT EXISTS idx_deals_merchant    ON deals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_deals_price       ON deals(price_cents);
CREATE INDEX IF NOT EXISTS idx_deals_discount    ON deals(discount_pct);
CREATE INDEX IF NOT EXISTS idx_deals_rating      ON deals(rating);

-- Composite index for the most common filtered query
CREATE INDEX IF NOT EXISTS idx_deals_cat_loc
  ON deals(category_slug, location_slug);

-- ----------------------------------------------------------------------
-- Vector search (sqlite-vec)
-- ----------------------------------------------------------------------
-- Dimension 1536 matches OpenAI text-embedding-3-small full output.
-- The provider abstraction normalises Ollama nomic-embed-text (768d) by
-- right-padding with zeros — wasteful but keeps the schema fixed.
-- A future migration could swap to a smaller dim once we commit to a
-- single provider.

CREATE VIRTUAL TABLE IF NOT EXISTS deal_vectors USING vec0(
  deal_id    TEXT PRIMARY KEY,
  embedding  FLOAT[1536]
);

-- ----------------------------------------------------------------------
-- Metadata
-- ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_meta(key, value) VALUES
  ('version', '1'),
  ('embedding_dim', '1536');
