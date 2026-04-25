// --- Type helper (inlined, zero deps) ---

interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

interface ToolDefinition<TInput = unknown> {
  id: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (params: { context: TInput }) => Promise<unknown>;
}

function defineTool<TInput>(
  def: ToolDefinition<TInput>
): ToolDefinition<TInput> {
  return def;
}

// --- Tool definition ---

export default defineTool<{ text: string }>({
  id: "word_count",
  description: "Count words, characters, and lines in the given text",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to analyze" },
    },
    required: ["text"],
  },
  execute: async ({ context }) => {
    const text = context.text ?? "";
    return {
      words: text.split(/\s+/).filter(Boolean).length,
      characters: text.length,
      lines: text.split("\n").length,
    };
  },
});
