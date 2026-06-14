# Shade — Private nanopayments for AI agents

> Machines are starting to pay each other — for API calls, inference, data, compute —
> in amounts far too small for traditional rails. But today those payment streams are
> **fully transparent**: anyone can watch an agent's spend, infer its strategy, and map
> its counterparties. **Shade makes high-frequency, low-value agent payments private.**

Built for the **Dynamic × Unlink × Circle / Arc** private-nanopayments track. Runs on
**Arc Testnet** (USDC).

**Live app:** `<your Vercel URL>` · **Architecture:** open [`docs/architecture-diagram.html`](docs/architecture-diagram.html) · **Submission write-up:** [`docs/SUBMISSION.md`](docs/SUBMISSION.md)

---

## The idea (the "surprise us" use case)

An autonomous trading agent buys data per call (the **x402** "HTTP 402 → pay → read"
pattern). With bare on-chain payments, every purchase is a footprint: a competitor
indexing the chain reconstructs **which oracles it queries, how often, its remaining
budget, and the wallet that funds it** — its entire strategy, for free.

Shade runs the **same agent over two rails** and makes the difference visible:

- **Transparent rail** — pay-per-call settles on-chain (Circle x402). A "spy" indexer
  rebuilds funder, oracles, budget and strategy.
- **Private rail (Unlink)** — the agent pays each oracle through Unlink private
  accounts; funding and spending are decoupled inside a privacy pool. The spy sees
  **only noise**.

The split-screen demo at **`/spy`** turns that contrast into the pitch: press *Run
agent live*, watch real transactions stream, watch the left panel reconstruct
everything and the right stay dark.

---

## How each integration is used (and what is private)

### 🔑 Dynamic — wallet creation, onboarding, identity
- The dashboard (`/app`) wraps the app in `DynamicContextProvider` and uses
  `useDynamicContext()` to connect a wallet — **no seed phrase, embedded-wallet flow**.
- The connected wallet **signs one canonical message**; that signature
  **deterministically derives** the agent's private Unlink identity
  (`fromEthereumSignature`). So **1 wallet = 1 bot**, with no account database.
- Dynamic also signs the on-chain **deposit/withdraw** (funding / unplugging). The
  per-call private payments need **no popup per payment** — the derived Unlink account
  signs them off-chain.
- Code: `app/providers.tsx`, `app/app/page.tsx`, `src/unlink/browser-client.ts`.

### 🛡️ Unlink — private accounts + private transaction routing
- `@unlink-xyz/sdk` derives a shielded account, deposits the budget into the privacy
  **pool**, and routes each oracle payment as a **private transfer** — balances,
  amounts and counterparties stay confidential.
- A **real private transfer** runs on every demo (the bots, the `/spy` private rail).
  A **real withdrawal** is used as a trustless proof: each oracle cashes its received
  balance out to a public address, so anyone can verify on ArcScan that value moved —
  **without revealing the payer**.
- **Bring-your-own-bot auth:** a stateless wallet-signature proof (`ShadeSig`) lets any
  self-custody user run an external bot that gets Unlink tokens **scoped to its own
  address** — the admin key never leaves the server.
- Code: `src/unlink/*`, `src/sdk/index.ts`, `src/payment/unlink-channel.ts`,
  `src/spy/private-run.ts`.

### 💵 Circle + Arc — gas-free USDC nanopayment settlement
- The transparent / paid-oracle rail settles via **Circle Gateway** using
  `@circle-fin/x402-batching` (`BatchFacilitatorClient`): each call returns **HTTP
  402**, the agent signs an **EIP-3009** authorization, and the facilitator
  **verifies + settles it gaslessly in batches** — real **sub-cent** settlement, not
  one large transfer.
- On **Arc Testnet**, gas is paid in USDC and settlement is high-throughput, which is
  what makes nanopayments economically sensible.
- Demo it live: `npm run circle:pay` (one live Circle nanopayment), or hit the
  Circle-gated oracle routes `/api/x402/eth` · `/api/x402/btc`.
- Code: `src/circle/with-gateway.ts`, `app/api/x402/{eth,btc}/route.ts`,
  `scripts/circle-pay.ts`, `src/chain/chains.ts`.

### What is private vs. public
| | On the chain a competitor sees |
|---|---|
| **Transparent rail (Circle x402)** | funder → agent, agent → each oracle, amounts, cadence → **strategy reconstructable** |
| **Private rail (Unlink)** | only an opaque pool. **Funder, oracles, amounts, budget and strategy are hidden.** |

What stays private with Shade: the agent's **funding source, which data it buys, how
much, how often, and the strategy** those payments imply. What's still publicly
verifiable (by design): that *some* value entered/left the pool (deposits and the proof
withdrawal) — never *who paid whom*.

---

## Demo it (what a judge clicks)

1. **The contrast** — `/spy` → *Run agent live*. Left rail reconstructs the agent;
   right rail stays dark. Tx hashes link to ArcScan; *verify on engine* shows the
   private payments are real (and a public withdrawal proves value moved without
   exposing the payer).
2. **Onboard + run** — `/app` → connect (Dynamic) → *Deploy* (derive identity) →
   *Fund* → monitor private activity → *Unplug*.
3. **Real Circle nanopayment** — `npm run circle:pay` (gas-free USDC micro-settlement).
4. **Bring your own bot** — `scripts/my-bot.ts` pays oracles privately; a second wallet
   (`scripts/my-bot-2.ts`) is a fully isolated second bot.

---

## Architecture

Open [`docs/architecture-diagram.html`](docs/architecture-diagram.html) in a browser
(source: [`docs/architecture.mmd`](docs/architecture.mmd)). Full write-up with
sequence diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Run locally

```bash
npm install
cp .env.example .env      # UNLINK_API_KEY, WALLET_MNEMONIC, NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID, …
npm run dev               # app + API routes (http://localhost:3000)
npm test                  # 65 unit tests

npm run circle:pay        # one live Circle nanopayment (server up)
npx tsx scripts/my-bot.ts # a "bring your own bot" paying privately
npm run check:activity    # verify the private payments via the Unlink engine
```

## Bring your own bot (no admin key)

Any self-custody user runs their own bot against the deployed app — it authenticates
with **its own wallet signature**, never the admin key:

```ts
import { createShadeAgent } from "@shade/pay";

const shade = createShadeAgent({
  environment: "arc-testnet",
  apiUrl: "https://<your-deployment>",         // remote mode — no admin key
  token: "0x3600000000000000000000000000000000000000",
  privateKey: process.env.BOT_WALLET_PRIVATE_KEY!, // the bot's own wallet
});
await shade.payPrivate(oracleAddress, "0.001");    // private, invisible on-chain
```

Integrating Shade into an existing bot: see [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
(3 steps + a before/after diff + the one caveat — your data provider must accept Unlink).

## Deploy (Vercel)

Server-side env (never exposed to users): `UNLINK_API_KEY` (admin key — stays on the
server), `UNLINK_ENVIRONMENT=arc-testnet`, `UNLINK_TEST_TOKEN`, `UNLINK_TOKEN_DECIMALS`,
`WALLET_MNEMONIC`, `RPC_URL`, plus the public `NEXT_PUBLIC_*` (Dynamic + token) and
`NEXT_PUBLIC_SHADE_APP_URL` (shown in the bot snippet). Stateless — no database.

## Tech stack & honest scope

Next.js (App Router) · TypeScript · viem · `@dynamic-labs/*` · `@unlink-xyz/sdk` ·
`@circle-fin/x402-batching` · vitest · Arc Testnet.

- **Real:** private payments for agent data (Unlink), Circle x402 batched settlement,
  Dynamic onboarding + identity derivation, per-user bot auth, two-wallet isolation.
- **Out of scope (by design):** real DEX trade execution (Shade protects *paying for
  data + the strategy*, not order execution); a nonce store for the auth replay window
  (testnet-acceptable); headless bots for embedded-wallet users (self-custody only).
