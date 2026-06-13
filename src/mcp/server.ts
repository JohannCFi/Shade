import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { createNodeUnlinkContext, type NodeUnlinkContext } from "../unlink/node-client.js";
import { config, fromBaseUnits } from "../unlink/config.js";
import { ethPriceAt, btcSignalAt } from "../oracle/feed.js";

/**
 * Shade MCP server — the "plug in your agent" surface.
 *
 * Exposes paid oracle tools that any MCP-capable agent (Claude Desktop, Cursor,
 * an Agent SDK app…) can call. Each call is paid PRIVATELY via Unlink from a
 * shared demo budget, so the agent's data spending leaves no on-chain
 * agent→oracle trail. In prod this budget would be per-user (auth + own account).
 */

const PRICE_UNITS = (10n ** BigInt(Math.max(config.tokenDecimals - 3, 0))).toString();

interface Wired {
  ctx: NodeUnlinkContext;
  sellers: { eth: string; btc: string };
}

let wiredPromise: Promise<Wired> | null = null;

/** Lazily set up the shared Unlink budget + register oracle sellers (once). */
function getWired(): Promise<Wired> {
  if (wiredPromise) return wiredPromise;
  wiredPromise = (async () => {
    const ctx = createNodeUnlinkContext(0);
    await ctx.client.ensureRegistered();

    const ethSeller = unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 });
    const btcSeller = unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 });
    const sellers = { eth: await ethSeller.getAddress(), btc: await btcSeller.getAddress() };
    await ctx.admin.users.register(await ethSeller.getRegistrationPayload());
    await ctx.admin.users.register(await btcSeller.getRegistrationPayload());

    // Top up the shared budget with fresh, spendable notes if low (capped).
    const { balances } = await ctx.client.getBalances({ token: config.testToken });
    const b = balances.find((x) => x.token.toLowerCase() === config.testToken.toLowerCase());
    const have = b ? BigInt(b.amount) : 0n;
    if (have < BigInt(PRICE_UNITS) * 10n) {
      const topUp = (10n ** BigInt(Math.max(config.tokenDecimals - 1, 0))).toString(); // 0.1
      await (await ctx.client.depositWithApproval({ token: config.testToken, amount: topUp })).wait();
    }
    return { ctx, sellers };
  })();
  return wiredPromise;
}

export function buildShadeMcpServer(): McpServer {
  const server = new McpServer({ name: "shade", version: "0.1.0" });

  server.registerTool(
    "list_oracles",
    {
      title: "List paid oracles",
      description: "List the paid data oracles Shade can call on your behalf, with their per-call price.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              oracles: [
                { id: "eth", description: "ETH spot price" },
                { id: "btc", description: "BTC trend signal" },
              ],
              pricePerCall: `${fromBaseUnits(PRICE_UNITS)} USDC`,
              rail: "Unlink (private) — no on-chain agent→oracle trail",
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "pay_oracle",
    {
      title: "Pay an oracle (privately)",
      description:
        "Pay a data oracle per-call via Unlink (private) and return its current value. " +
        "The payment is settled inside the Unlink privacy pool, so it leaves no readable " +
        "agent→oracle edge on-chain.",
      inputSchema: {
        oracle: z.enum(["eth", "btc"]).describe("Which oracle to query"),
        tick: z.number().int().optional().describe("Optional deterministic tick (defaults to time)"),
      },
    },
    async ({ oracle, tick }) => {
      const { ctx, sellers } = await getWired();
      const t = tick ?? Math.floor(Date.now() / 1000 / 5);
      const recipient = oracle === "eth" ? sellers.eth : sellers.btc;

      await (await ctx.client.transfer({
        token: config.testToken,
        amount: PRICE_UNITS,
        recipientAddress: recipient,
      })).wait();

      const value = oracle === "eth" ? ethPriceAt(t) : btcSignalAt(t);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                oracle,
                tick: t,
                value,
                paid: `${fromBaseUnits(PRICE_UNITS)} USDC`,
                rail: "Unlink (private)",
                note: "Payment settled privately — invisible to a chain observer.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
