import pino from "pino";

/**
 * MCP stdio servers MUST NOT write to stdout — any non-JSON-RPC byte
 * kills the connection. We route every log line to stderr (fd 2),
 * regardless of transport. The eslint config also forbids `console`
 * in src/mcp/** as a belt-and-braces measure.
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "groupon-deal-intelligence" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(2),
);

export type Logger = typeof logger;
