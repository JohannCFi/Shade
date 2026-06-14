# Shade — Private Nano-Payment Agent

> ETHGlobal New York 2026 — prize **"Best Private Nano Payment App"** (sponsor Unlink).
> Combines **Dynamic** (onboarding/wallet) + **Unlink** (private accounts) + **Circle Nanopayments** (x402 v2 / EIP-3009 settlement). Runs on **Arc Testnet**.

## Pitch

An autonomous agent whose **funding** (by its owner) and **spending** (per API call)
are completely unreadable on-chain — where bare x402 exposes the agent's strategy,
its budget and its funder to any competitor reading the chain.

## Demo (split-screen "as a competitor sees it")

- **Left — bare x402 (transparent)**: a "spy" panel reconstructs the agent's strategy
  (which oracles, how often), its budget, and the wallet that funded it.
- **Right — same agent on Unlink**: the spy panel shows only noise.

The visual contrast **is** the pitch. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Stack

- Next.js (App Router) — front + API routes
- `@unlink-xyz/sdk` — private accounts (Arc Testnet, USDC)
- Dynamic SDK — owner onboarding / embedded wallet
- `@circle-fin/x402-batching` — Circle Nanopayments settlement (x402 v2, EIP-3009)
- `@modelcontextprotocol/sdk` — MCP server ("plug in any agent")

## Status (live on Arc Testnet)

| Piece | Status |
|------|--------|
| Unlink derisk `deposit → transfer → withdraw` | ✅ live |
| x402 oracle endpoints | ✅ |
| Agent loop + strategy | ✅ |
| Payment channels (transparent EIP-3009 / Unlink) | ✅ |
| Circle Nanopayments settlement | ✅ live |
| Owner flow (Connect → Deploy → Fund → Run) | ✅ live in browser |
| MCP server ("plug in your agent") | ✅ live |
| Spy indexer (reconstruct + chain reader) | ✅ (logic) |
| Split-screen UI / design | 🔵 in progress |

## Scripts

```bash
npm run dev              # Next.js dev server (the app + API routes)
npm test                 # unit tests (vitest)

npm run derisk:unlink    # Unlink deposit→transfer→withdraw on Arc
npm run circle:pay       # one live Circle nanopayment (server must be up)
npm run agent:run -- --rail both --ticks 2 --limit 0.05   # live agent, both rails
npm run mcp              # start the Shade MCP server (stdio)
npx tsx scripts/mcp-test.ts     # end-to-end MCP test
npm run spy:demo         # spy engine preview (the split-screen contrast, headless)
npm run check:activity   # verify private payments via the Unlink engine
```

## Config

Copy `.env.example` → `.env` and fill in: `UNLINK_API_KEY`, `UNLINK_ENVIRONMENT=arc-testnet`,
`WALLET_MNEMONIC`, `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. See `.env.example` for the full list.

## Deploy (Vercel)

Set these env vars in the Vercel project (server-side, **never** exposed to users):

```
UNLINK_API_KEY          # admin key — stays on the server, never shipped to bots
UNLINK_ENVIRONMENT=arc-testnet
UNLINK_TEST_TOKEN=0x3600000000000000000000000000000000000000
UNLINK_TOKEN_DECIMALS=6
WALLET_MNEMONIC         # project wallet (in-app demo + oracle sellers)
RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
NEXT_PUBLIC_UNLINK_ENVIRONMENT=arc-testnet
NEXT_PUBLIC_UNLINK_TOKEN=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_UNLINK_TOKEN_DECIMALS=6
NEXT_PUBLIC_SHADE_APP_URL   # the deployed URL, shown in the "connect your bot" snippet
```

### Bring your own bot (no admin key)

Any self-custody user can run their own bot against the deployed app — it
authenticates with **its own wallet signature**, never the admin key:

```ts
import { createShadeAgent } from "@shade/pay";

const shade = createShadeAgent({
  environment: "arc-testnet",
  apiUrl: "https://<your-deployment>",      // remote mode — no admin key
  token: "0x3600000000000000000000000000000000000000",
  privateKey: process.env.BOT_WALLET_PRIVATE_KEY!, // the bot's own wallet
});
await shade.payPrivate(oracleAddress, "0.001"); // private, invisible on-chain
```

The bot signs a stateless proof (`ShadeSig`); the backend verifies it and issues
Unlink tokens **scoped to that wallet's address only**. Test locally:
`SHADE_API_URL=http://localhost:3001 npx tsx scripts/my-bot.ts --ticks 2`.
