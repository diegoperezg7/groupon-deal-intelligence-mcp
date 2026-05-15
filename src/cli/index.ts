import { Command } from "commander";

import { buildSearchCommand } from "./commands/search.js";
import { buildDealCommand } from "./commands/deal.js";
import { buildSimilarCommand } from "./commands/similar.js";
import { buildCompareCommand } from "./commands/compare.js";
import { buildAnalyzeCommand } from "./commands/analyze.js";
import { buildCategoryCommand } from "./commands/category.js";
import { buildCategoriesCommand } from "./commands/categories.js";
import { buildLocationsCommand } from "./commands/locations.js";
import { buildMerchantsCommand } from "./commands/merchants.js";
import { buildOverviewCommand } from "./commands/overview.js";
import { buildIngestCommand } from "./commands/ingest.js";
import { buildDoctorCommand } from "./commands/doctor.js";

const program = new Command();

program
  .name("groupon-intel")
  .description(
    "CLI companion to the groupon-deal-intelligence MCP server. Same intelligence core, different interface.",
  )
  .version("0.1.0");

program.addCommand(buildSearchCommand());
program.addCommand(buildDealCommand());
program.addCommand(buildSimilarCommand());
program.addCommand(buildCompareCommand());
program.addCommand(buildAnalyzeCommand());
program.addCommand(buildCategoryCommand());
program.addCommand(buildCategoriesCommand());
program.addCommand(buildLocationsCommand());
program.addCommand(buildMerchantsCommand());
program.addCommand(buildOverviewCommand());
program.addCommand(buildIngestCommand());
program.addCommand(buildDoctorCommand());

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
