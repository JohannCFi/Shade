/**
 * End-to-end MCP test: spawn the Shade MCP server over stdio, list tools, and
 * call pay_oracle (which pays an oracle privately via Unlink). Proves any MCP
 * client can plug in and pay privately.
 *
 * Run: npx tsx scripts/mcp-test.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "scripts/mcp-server.ts"],
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "shade-mcp-test", version: "0.0.0" });
  await client.connect(transport);

  console.log("=== tools ===");
  const tools = await client.listTools();
  for (const t of tools.tools) console.log(`  - ${t.name}: ${t.description?.slice(0, 60)}…`);

  console.log("\n=== call list_oracles ===");
  const oracles = await client.callTool({ name: "list_oracles", arguments: {} });
  console.log((oracles.content as { type: string; text: string }[])[0].text);

  console.log("\n=== call pay_oracle(eth, tick=3) — pays privately via Unlink ===");
  const paid = await client.callTool({ name: "pay_oracle", arguments: { oracle: "eth", tick: 3 } });
  console.log((paid.content as { type: string; text: string }[])[0].text);

  await client.close();
  console.log("\n=== ✅ MCP server works end-to-end ===");
}

main().catch((e) => { console.error("=== ❌ MCP test FAILED ==="); console.error(e); process.exit(1); });
