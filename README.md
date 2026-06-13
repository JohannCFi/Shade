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
