# Integrate Shade into your existing bot

Shade is **not** a framework you rebuild your bot in. It's the **private payment
rail** for the data your bot already buys. You keep your strategy, your execution,
your infra — you only change **where your bot pays for data**.

---

## TL;DR — 3 steps

```ts
import { createShadeAgent } from "@shade/pay";

// 1. Configure once (your wallet key + the deployed Shade URL)
const shade = createShadeAgent({
  environment: "arc-testnet",
  apiUrl: "https://<your-deployment>",        // remote mode — no admin key
  token: "0x3600000000000000000000000000000000000000", // USDC
  privateKey: process.env.BOT_WALLET_PRIVATE_KEY!,      // a dedicated bot wallet
});

// 2. (once) fund a private budget — or do it in the /app dashboard
await shade.fundBudget("5");                   // 5 USDC into your private pool

// 3. In your loop, pay for data PRIVATELY instead of however you paid before
await shade.payPrivate(oracleUnlinkAddress, "0.001");
const price = await fetchOracleData(...);      // your existing read, unchanged
```

That's the whole integration. Your trading logic, order execution, and everything
else stay exactly as they are.

---

## Before / after

**Before** — your bot pays for a price feed on a transparent rail (visible on-chain):

```ts
await payOracleOnChain(ethOracle, "0.001");    // ← a competitor can read this
const eth = await readOracle(ethOracle);
const action = myStrategy(eth);
```

**After** — the same call, routed through Shade (invisible on-chain):

```ts
await shade.payPrivate(ethOracleUnlinkAddr, "0.001");  // ← unreadable on-chain
const eth = await readOracle(ethOracle);
const action = myStrategy(eth);                         // unchanged
```

Only the **payment line** changes. Funding and spending are now decoupled inside
the Unlink privacy pool — nobody indexing the chain can reconstruct your oracles,
budget, or strategy.

---

## The one thing to know (important)

Shade privatizes **on-chain, pay-per-call data purchases** (the x402 "402 → pay →
read" pattern). It works when the **data provider accepts Unlink payments** — i.e.
the oracle/API has an Unlink "seller" address you transfer to.

- ✅ **Works:** Shade's own oracles, or any provider that advertises an Unlink
  payment option (e.g. in its HTTP 402 response: "pay X to this Unlink address").
- ❌ **Not applicable:** a paid API that uses an API key / subscription / a non-Unlink
  rail. There's no on-chain nanopayment there to make private.

You get the provider's Unlink seller address from the provider itself (in the demo,
the oracle sellers are derived deterministically; a real provider advertises it in
its 402 payment requirements).

---

## Setup details

**Install:** `npm install @shade/pay` (this repo's `src/sdk`).

**Wallet = bot identity.** Shade derives your private identity from your wallet
signature, so **1 wallet = 1 bot**. Use a **dedicated** wallet for the bot, not your
personal one. The same wallet you connect in `/app` is the same bot — its budget and
activity show up in the dashboard.

**Two modes:**
- **Remote (recommended for deployed apps):** pass `apiUrl`. Your bot authenticates
  with its own wallet signature; the admin key stays on the server. No `apiKey` in
  your bot.
- **Local / self-hosted:** pass `apiKey` (your own Unlink project key) instead of
  `apiUrl`. The bot talks to Unlink directly.

**Funding:** either call `shade.fundBudget("5")` (deposits from the bot wallet, which
needs USDC + a little gas on Arc), or fund once in the `/app` dashboard.

---

## SDK reference

```ts
const shade = createShadeAgent({
  environment?: "arc-testnet",        // default
  apiUrl?: string,                    // remote mode (no admin key)
  apiKey?: string,                    // local mode (your Unlink key) — ignored if apiUrl set
  token: string,                      // USDC address
  tokenDecimals?: number,             // 6
  mnemonic?: string,                  // OR
  privateKey?: string,                // the bot wallet
  rpcUrl?: string,
});

await shade.ready();                  // derive + register (idempotent)
await shade.address();                // your private unlink1… address
await shade.fundBudget("5");          // deposit into the private pool
await shade.budget();                 // remaining, human-readable
await shade.payPrivate(addr, "0.001");// pay an Unlink recipient privately
await shade.withdraw(evmAddr, "5");   // pull the budget back to an EVM address
```

---

## Copy from a working example

Three runnable bots show the exact pattern end to end:

- `scripts/my-bot.ts` — a mean-reversion bot paying oracles privately.
- `scripts/my-bot-2.ts` — a second bot on a second wallet (proves 1 wallet = 1 bot).
- `scripts/example-bot.ts` — another strategy via the SDK.

Run one against a deployed app:
```bash
SHADE_API_URL=https://<deployment> BOT_WALLET_PRIVATE_KEY=0x… npx tsx scripts/my-bot.ts
```
