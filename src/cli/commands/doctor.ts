import { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DealStore, getEmbeddingsProvider } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";

/**
 * `groupon-intel doctor` — end-to-end health check.
 *
 * - validate env var schema
 * - check SQLite file exists, schema version present, deal_vectors populated
 * - run a 1-shot embedding round-trip
 * - run a 1-shot semantic search
 *
 * Exits non-zero on the first failure with an actionable message.
 */
export function buildDoctorCommand(): Command {
  return new Command("doctor")
    .description("Run an end-to-end health check of the local install.")
    .action(async () => {
      const out = (msg: string) => process.stdout.write(`${msg}\n`);
      const fail = (msg: string) => {
        process.stderr.write(`  ✗ ${msg}\n`);
        process.exit(1);
      };

      out("groupon-intel doctor");

      // 1. Config
      let cfg: ReturnType<typeof loadConfig>;
      try {
        cfg = loadConfig();
        out(`  ✓ config loaded (provider=${cfg.EMBEDDINGS_PROVIDER})`);
      } catch (err) {
        fail(`config invalid: ${(err as Error).message}`);
        return;
      }

      // 2. SQLite file present
      const dbPath = resolve(cfg.SQLITE_PATH);
      if (!existsSync(dbPath)) {
        fail(
          `SQLite database not found at ${dbPath}. ` +
            `Run \`groupon-intel ingest\` (or the Python ingest pipeline) first.`,
        );
        return;
      }
      out(`  ✓ SQLite at ${dbPath}`);

      // 3. Store + schema version
      let store: DealStore;
      try {
        store = new DealStore(dbPath);
      } catch (err) {
        fail(`failed to open store: ${(err as Error).message}`);
        return;
      }
      try {
        const version = store.schemaVersion();
        if (!version) {
          fail("schema_meta is empty — was the schema applied?");
          return;
        }
        out(`  ✓ schema version ${version}`);

        const dealCount = store.countDeals();
        if (dealCount === 0) {
          fail("no deals in the store — run ingestion to populate");
          return;
        }
        out(`  ✓ ${dealCount} deals in catalogue`);
        out(`  ✓ ${store.listCategories().length} categories`);
        out(`  ✓ ${store.listLocations().length} locations`);

        // 4. Embeddings round-trip
        const embeddings = getEmbeddingsProvider();
        const vec = await embeddings.embed("masaje relajante en madrid");
        if (vec.length === 0) {
          fail("embeddings provider returned an empty vector");
          return;
        }
        out(`  ✓ embeddings provider responded (dim=${vec.length})`);

        // 5. End-to-end semantic search
        const results = store.searchByEmbedding(vec, { limit: 1 });
        if (results.length === 0) {
          fail("semantic search returned 0 rows — are embeddings populated?");
          return;
        }
        out(
          `  ✓ semantic search works — top hit: '${results[0].title.slice(0, 60)}' (sim=${results[0].similarity.toFixed(3)})`,
        );

        out("\nAll green. The MCP server is ready to serve.");
      } finally {
        store.close();
      }
    });
}
