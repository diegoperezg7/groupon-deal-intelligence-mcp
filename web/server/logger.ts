import pino from "pino";
import { loadWebConfig } from "./config.js";

const cfg = loadWebConfig();

// Pino → stderr (fd 2). Matches the discipline of the MCP stdio server;
// for the HTTP BFF it's not strictly required but keeping stderr-only
// means we never accidentally interleave logs with SSE bodies on stdout.
export const logger = pino(
  {
    level: cfg.LOG_LEVEL,
    base: { service: "groupon-deal-intelligence-web" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(2),
);

export type Logger = typeof logger;
