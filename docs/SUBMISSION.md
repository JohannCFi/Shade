# Shade — Private nanopayments for AI agents

**Track:** Best Private Nano Payment App (Dynamic × Unlink × Circle, Arc Testnet)
**Repo:** https://github.com/JohannCFi/Shade

> An autonomous agent's **funding** (by its owner) and **spending** (per API call)
> are **unreadable on-chain** — where bare x402 leaks the agent's strategy, budget
> and funder to anyone reading the chain.

---

## 1. The problem

AI agents increasingly pay for data per call (the **x402** "HTTP 402 → pay → read"
pattern). Done with bare on-chain transfers, every payment is a footprint: a
competitor indexing the chain reconstructs **which oracles you query, how often,
your remaining budget, and the wallet that funds you** — i.e. your whole strategy,
for free.

## 2. The solution — Shade

The **same agent** runs over **two rails**. The only difference is what a chain
observer can reconstruct:

- **Transparent rail (bare x402):** pay-per-call settles on-chain via **Circle
  Gateway**. Fully visible — a "spy" indexer rebuilds funder, oracles, budget and
  strategy.
- **Private rail (Unlink):** the agent pays each oracle through **Unlink private
  accounts**; funding and spending are decoupled inside a privacy pool. The same
  spy sees **only noise**.

The split-screen demo (`/spy`) makes this contrast literal: press **Run agent
live**, watch the agent's real transactions stream, watch the left panel rebuild
everything and the right stay dark.

## 3. Required integrations (where, in code)

| SDK / tech | Used for | Code |
|---|---|---|
| **Dynamic** | Wallet creation + onboarding; the wallet signature **deterministically derives** the agent's private identity (1 wallet = 1 bot) | `app/providers.tsx`, `app/app/page.tsx`, `src/unlink/browser-client.ts` |
| **Unlink** | Private accounts, shielded transfers, deposit/withdraw, per-user auth tokens | `src/unlink/*`, `src/sdk/index.ts`, `src/payment/unlink-channel.ts` |
| **Circle** | Nanopayment **settlement** of the transparent rail via Gateway x402 batching (verify + settle, EIP-3009) | `src/circle/with-gateway.ts`, `app/api/x402/{eth,btc}/route.ts`, `scripts/circle-pay.ts` |
| **Arc Testnet** | Chain — gas in USDC, high-throughput settlement | `src/chain/chains.ts` |

## 4. Architecture

See `docs/architecture-diagram.html` (open in a browser) or `docs/architecture.mmd`
(paste into mermaid.live). Full write-up with sequence diagrams in
`docs/ARCHITECTURE.md`.

Flow: **User → Dynamic** (connect) → **Deploy** (sign → derive Unlink identity) →
**Fund** (deposit into the Unlink pool) → the agent pays oracles; the transparent
rail settles via **Circle**, the private rail routes through **Unlink**.

## 5. Core features (what to demo)

1. **The contrast** — `/spy`: live agent, two rails, spy blind on the private one.
   On-chain proof links to ArcScan; a withdrawal makes the private value publicly
   verifiable **without revealing the payer**.
2. **The dashboard** — `/app`: connect (Dynamic) → deploy → fund → monitor private
   activity → unplug. Works for any user.
3. **Bring your own bot** — a deployed-app SDK (`@shade/pay`): any self-custody
   user runs their own external bot that pays privately, authenticating with a
   **stateless wallet signature** (`ShadeSig`) — **the admin key never leaves the
   server**. Demonstrated: two different wallets = two isolated bots/budgets.
4. **Circle settlement** — `npm run circle:pay` runs one live Circle nanopayment;
   the `/api/x402/*` oracles are Circle-gated (HTTP 402 → verify → settle).

## 6. How to run

```bash
npm install
cp .env.example .env          # fill UNLINK_API_KEY, WALLET_MNEMONIC, NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID, …
npm run dev                   # app + API routes (http://localhost:3000)

npm test                      # 65 unit tests
npm run circle:pay            # one live Circle nanopayment (server up)
npx tsx scripts/my-bot.ts     # a "bring your own bot" paying privately
```

**Bring-your-own-bot (no admin key), against the deployed app:**
```ts
import { createShadeAgent } from "@shade/pay";
const shade = createShadeAgent({
  environment: "arc-testnet",
  apiUrl: "https://<deployment>",            // remote mode — no admin key
  token: "0x3600000000000000000000000000000000000000",
  privateKey: process.env.BOT_WALLET_PRIVATE_KEY!,
});
await shade.payPrivate(oracleAddress, "0.001");
```

## 7. Security model (per-user auth)

The bot proves ownership of its Unlink address with **two wallet signatures**
(identity + freshness). The backend re-derives the address independently, checks
the timestamp, and issues an Unlink token **scoped to that address only**. Stateless
(no database) → deploys on Vercel as-is. The Unlink **admin key stays server-side**.
Spec: `docs/superpowers/specs/2026-06-14-per-user-bot-auth-design.md`.

## 8. Honest scope

- **Real:** private payments for agent data (Unlink), Circle x402 settlement of the
  transparent rail, Dynamic onboarding, the per-user auth, the two-bot isolation.
- **Out of scope (by design):** real DEX trade execution (Shade protects *paying for
  data + the strategy*, not order execution); a nonce store for the auth replay
  window (testnet-acceptable as-is); headless bots for embedded-wallet users
  (self-custody only — an industry-wide custody constraint, not a Shade limit).

## 9. Tech stack

Next.js (App Router) · TypeScript · viem · `@dynamic-labs/*` · `@unlink-xyz/sdk` ·
`@circle-fin/x402-batching` · vitest · Arc Testnet (USDC).
