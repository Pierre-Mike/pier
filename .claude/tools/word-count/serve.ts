/**
 * serve.ts — MCP server for this tool.
 * Usage:
 *   bun serve.ts              # stdio (default)
 *   bun serve.ts --http 3000  # streamable HTTP
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import tool from "./tool.ts";

let httpPort: number | null = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--http") {
    httpPort = Number.parseInt(process.argv[++i], 10);
  }
}

const server = new Server(
  { name: tool.id, version: "1.0.0" },
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== tool.id) {
    return {
      content: [
        { type: "text" as const, text: `Unknown tool: ${request.params.name}` },
      ],
      isError: true,
    };
  }
  try {
    const result = await tool.execute({
      context: request.params.arguments ?? {},
    });
    const text =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

if (httpPort) {
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const http = await import("node:http");
  const { randomUUID } = await import("node:crypto");

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  http
    .createServer(async (req, res) => {
      if (req.url === "/mcp") {
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(404).end("Not found");
      }
    })
    .listen(httpPort, () => {
      console.error(`MCP "${tool.id}" → http://localhost:${httpPort}/mcp`);
    });
} else {
  await server.connect(new StdioServerTransport());
}
