/**
 * Shade MCP server entry (stdio transport).
 *
 * Point any MCP client at it (Claude Desktop, Cursor, an Agent SDK app) to let
 * an agent pay data oracles privately via Unlink. Example Claude Desktop config:
 *
 *   "shade": {
 *     "command": "npx",
 *     "args": ["tsx", "scripts/mcp-server.ts"],
 *     "cwd": "C:/Applications/Finance/Projets/Shade"
 *   }
 *
 * NOTE: stdout is the MCP protocol channel — only log to stderr.
 */
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildShadeMcpServer } from "../src/mcp/server.js";

const server = buildShadeMcpServer();
await server.connect(new StdioServerTransport());
console.error("[shade-mcp] ready on stdio");
