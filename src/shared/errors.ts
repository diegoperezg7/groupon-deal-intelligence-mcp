import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Convenience wrappers around the MCP error codes. Always surface
 * actionable messages — the LLM downstream uses them to recover.
 */

export class DealNotFoundError extends McpError {
  constructor(idOrUrl: string) {
    super(ErrorCode.InvalidParams, `Deal not found: ${idOrUrl}`);
  }
}

export class CategoryNotFoundError extends McpError {
  constructor(slug: string) {
    super(
      ErrorCode.InvalidParams,
      `Unknown category slug "${slug}". Use list_categories to see available ones.`,
    );
  }
}

export class LocationNotFoundError extends McpError {
  constructor(slug: string) {
    super(
      ErrorCode.InvalidParams,
      `Unknown location slug "${slug}". Use list_locations to see available ones.`,
    );
  }
}

export class EmbeddingProviderError extends McpError {
  constructor(provider: string, cause: unknown) {
    const detail =
      cause instanceof Error ? cause.message : String(cause ?? "unknown");
    super(
      ErrorCode.InternalError,
      `Embeddings provider '${provider}' failed: ${detail}`,
    );
  }
}

export class StoreNotInitializedError extends McpError {
  constructor(path: string) {
    super(
      ErrorCode.InternalError,
      `SQLite store at ${path} does not exist or is empty. Run the ingestion pipeline first: see README.`,
    );
  }
}

export function wrapUnknown(err: unknown, context: string): McpError {
  if (err instanceof McpError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new McpError(ErrorCode.InternalError, `${context}: ${message}`);
}
