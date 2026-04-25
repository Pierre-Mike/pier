/**
 * define-tool.ts — Type-safe tool definition helper. Zero dependencies.
 *
 * Usage:
 *   import { defineTool } from "../define-tool.ts";
 *   export default defineTool({ id, description, inputSchema, execute });
 */

export interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition<TInput = unknown> {
  id: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (params: { context: TInput }) => Promise<unknown>;
}

export function defineTool<TInput>(
  def: ToolDefinition<TInput>
): ToolDefinition<TInput> {
  return def;
}
