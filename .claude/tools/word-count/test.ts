import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import tool from "./tool.ts";

async function createMcpPair() {
  const server = new Server(
    { name: "test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await tool.execute({ context: req.params.arguments ?? {} });
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
    };
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

describe("word-count", () => {
  describe("unit", () => {
    test("counts words, characters, lines", async () => {
      const r = await tool.execute({ context: { text: "hello world\nfoo" } });
      expect(r).toEqual({ words: 3, characters: 15, lines: 2 });
    });

    test("empty string", async () => {
      const r = await tool.execute({ context: { text: "" } });
      expect(r).toEqual({ words: 0, characters: 0, lines: 1 });
    });

    test("multiline", async () => {
      const r = await tool.execute({ context: { text: "a\nb\nc" } });
      expect(r).toEqual({ words: 3, characters: 5, lines: 3 });
    });
  });

  describe("MCP", () => {
    test("lists tool with correct metadata", async () => {
      const client = await createMcpPair();
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("word_count");
      expect(tools[0].description).toBe(tool.description);
    });

    test("callTool returns counts", async () => {
      const client = await createMcpPair();
      const r = await client.callTool({
        name: "word_count",
        arguments: { text: "hello world" },
      });
      const c = r.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(c[0].text)).toEqual({
        words: 2,
        characters: 11,
        lines: 1,
      });
    });

    test("callTool empty text", async () => {
      const client = await createMcpPair();
      const r = await client.callTool({
        name: "word_count",
        arguments: { text: "" },
      });
      const c = r.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(c[0].text)).toEqual({
        words: 0,
        characters: 0,
        lines: 1,
      });
    });

    test("callTool multiline", async () => {
      const client = await createMcpPair();
      const r = await client.callTool({
        name: "word_count",
        arguments: { text: "a\nb\nc" },
      });
      const c = r.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(c[0].text)).toEqual({
        words: 3,
        characters: 5,
        lines: 3,
      });
    });
  });
});
