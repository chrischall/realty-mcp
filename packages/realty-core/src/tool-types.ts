/**
 * Structural types for the tool registrars (`registerMortgageTool`,
 * `registerAffordabilityTool`).
 *
 * realty-core is dependency-free by invariant (see CLAUDE.md) — it must
 * not import `zod` or `@modelcontextprotocol/server`. The registrars
 * therefore take the consumer's own `z` and `McpServer` as arguments,
 * typed by the minimal shapes below. Every cohort MCP already depends
 * on both, so the schema is built with the consumer's zod instance
 * (one zod copy, same version as the rest of its tools) and registered
 * on its server. A real `z` from zod 4 and a real `McpServer` from
 * `@modelcontextprotocol/server` 2.x satisfy these shapes; the
 * `mortgage-tools` tests drive them end-to-end.
 */

/** The subset of a zod number schema the registrars chain. */
export interface ZodNumberLike {
  positive(): ZodNumberLike;
  nonnegative(): ZodNumberLike;
  int(): ZodNumberLike;
  min(value: number): ZodNumberLike;
  max(value: number): ZodNumberLike;
  describe(description: string): ZodNumberLike;
  optional(): ZodOptionalLike;
}

/** The subset of a zod optional wrapper the registrars chain. */
export interface ZodOptionalLike {
  describe(description: string): ZodOptionalLike;
}

/** The subset of zod's `z` namespace the registrars use. */
export interface ZodLike {
  number(): ZodNumberLike;
  object(shape: Record<string, ZodNumberLike | ZodOptionalLike>): unknown;
}

/** Tool annotations, as the MCP spec defines them. */
export interface ToolAnnotationsLike {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Any MCP tool result (structurally: a `content` block list). */
export interface ToolResultLike {
  [key: string]: unknown;
  content: ReadonlyArray<{ type: string }>;
}

/** A single-text-block tool result (the fleet's `minifiedResult` shape). */
export interface TextToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}

/**
 * The subset of `McpServer` the registrars call. Declared with method
 * syntax so `McpServer`'s generic `registerTool` overloads are assignable.
 */
export interface ToolServerLike {
  registerTool(
    name: string,
    config: {
      title?: string;
      description?: string;
      annotations?: ToolAnnotationsLike;
      inputSchema?: unknown;
    },
    // `any` args + result: the SDK types its callback against its own
    // CallToolResult union, which a dependency-free shape cannot name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any) => any
  ): unknown;
}

/**
 * Wrap a JSON-serialisable value as a minified text tool result —
 * byte-identical to `@chrischall/mcp-utils`' `minifiedResult`
 * (`JSON.stringify(data)`, no indent), which every cohort tool used.
 */
export function jsonToolResult(data: unknown): TextToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}
