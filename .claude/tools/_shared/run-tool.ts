/**
 * run-tool.ts — Shared CLI runner for all TS tools.
 * Usage: bun run-tool.ts <tool.ts>  [--input '{}'] [--schema]
 */

const [toolPath, ...rest] = process.argv.slice(2);

if (!toolPath) {
  console.error("Error: tool path required");
  process.exit(1);
}

let input = "{}";
let schema = false;

for (let i = 0; i < rest.length; i++) {
  switch (rest[i]) {
    case "--input":
      input = rest[++i];
      break;
    case "--schema":
      schema = true;
      break;
    default:
      console.error(`Unknown arg: ${rest[i]}`);
      process.exit(1);
  }
}

const mod = await import(toolPath);
const tool = mod.default ?? mod;

if (!tool || typeof tool !== "object") {
  console.error("Error: tool must default-export a definition");
  process.exit(1);
}

if (schema) {
  console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2));
  process.exit(0);
}

if (typeof tool.execute !== "function") {
  console.error("Error: tool must have an execute() function");
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(input);
} catch {
  console.error(`Error: invalid JSON input: ${input}`);
  process.exit(1);
}

try {
  const result = await tool.execute({ context: parsed });
  const output =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  console.log(output);
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
