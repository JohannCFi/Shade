# Bot Dashboard — connect your bot to Shade (design)

**Date:** 2026-06-14 · **Branch:** `feat/bot-dashboard`

## Goal
A dedicated app interface (a "cockpit") reached via **Launch app**, where a user:
connects a **dedicated wallet**, **deploys** their bot's private identity, **funds** a
private budget, gets a **snippet to plug their external bot**, **monitors** private
activity, and can **unplug** (defund) anytime.

The narrative to make obvious: **① plug your bot into Shade → ② run it as usual
(your code + SDK) → ③ monitor it here.** The user keeps running their own bot
normally; only its data **payments** go through Shade (private via Unlink).

## Custody model (option C)
- **Wallet = deterministic bot identity** — the Unlink account is derived from the
  wallet's signature. **1 wallet = 1 bot.**
- The bot (the user's external code) holds the **dedicated** wallet's key, so it
  operates with the **same identity** via the SDK.
- **Unplug = withdraw the full private budget** (defund) → the bot can no longer
  pay. Honest limitation: option C has no cryptographic key-revocation; true
  session-key revocation is **option B (roadmap)**.

## Budget model (key decision)
A dedicated wallet is good practice (isolation), but the wallet balance is **public**;
to pay privately the funds must sit **inside the Unlink pool**. So the "private budget"
= what has been **deposited** into the pool.
- **Default**: the Fund amount is **pre-filled to ~the whole wallet balance** (minus a
  small **gas reserve**, since Arc gas is USDC and deposit/withdraw cost gas; private
  transfers are ~gasless). UX: "your wallet = your bot's budget".
- **Optional**: the user can **edit the amount** (deposit less / top up later).
- One lump deposit is also better for privacy than per-payment micro-deposits
  (deposits are public; private spending afterwards is not).

## Non-goals
- Do **not** touch the landing, `/spy`, the backend, or the custody model.
- **No Run button** on the dashboard (Run stays only on `/spy`, the demo).
- **No in-UI strategy editor** — a custom strategy is the external bot via the SDK.

## Route & shell
- **Launch app → `/app`** (update the nav/CTA links to point there).
- **Minimal app shell**: only the **Shade logo top-left, clickable → `/`**. No landing navbar.
- Keep the existing `/flow` untouched (legacy); just stop linking to it. `/app` supersedes it.

## States (one page, progressive)
1. **Disconnected** → "Connect your wallet" (Dynamic) + "your dedicated wallet = your bot".
2. **Connected, not deployed** → explicit **"Deploy my bot"** (signature → Unlink
   identity; "1 bot per wallet, deterministic"); shows the wallet.
3. **Deployed** → the cockpit.

## Cockpit panels
- **Identity**: `Wallet 0x… → Bot unlink1…`, badge "1 bot per wallet · deterministic",
  deployed status, a short "how it's recognized" note.
- **Private budget**: balance + a Fund control **pre-filled to ~the full wallet balance
  (minus gas reserve), editable** ("Fund private budget") + **"Unplug bot"** (withdraw
  the full budget → defund).
- **Connect your external bot**: a copyable **SDK snippet** configured for THIS wallet
  (env + a `payPrivate` example) → same identity as shown.
- **Monitoring**: private activity / recent history (`getTransactions`) — the
  "monitor on Shade" value.

## Clarity guarantees (the core ask)
- **1 bot/wallet** — deterministic, stated explicitly, a single identity shown.
- **Deployment transparency** — explicit deploy + the signature→identity mechanism
  explained + resulting address + status.
- **Unplug anytime** — defund in one click.

## Data sources (all already implemented & live)
- identity: `src/unlink/browser-client.ts` (deterministic derivation)
- wallet balance (for the default fund amount): viem `publicClient` balanceOf USDC
- budget: `client.getBalances`; fund: `client.depositWithApproval`; unplug/withdraw: `client.withdraw`
- monitoring: `client.getTransactions`
- deploy: `client.ensureRegistered`
- Everything runs in the browser via the Dynamic wallet (option C, non-custodial).

## Components / files
- **New** `app/app/page.tsx` (`"use client"`) — the dashboard, with small focused
  pieces (IdentityCard, BudgetCard, ConnectBotCard, ActivityFeed) inline or under
  `app/app/_components/`.
- A minimal **app shell** (logo bar) local to `/app`.
- Update **Launch app** links (landing nav + hero CTA) to `/app`.
- Reuse `browser-client.ts`, `getTransactions`; a tiny pure **snippet generator** helper (unit-testable).
- Leave `/flow`, `/spy`, backend, design system as-is.

## Testing
- Unit-test the pure snippet generator + the "gas-reserve / default fund amount" helper.
- `tsc --noEmit` + `next build` clean; `/app` serves 200 in each state.
- Actions reuse already-live SDK paths (deploy/fund/withdraw/getTransactions verified earlier).

## Out of scope / roadmap
- Session-key true revocation (option B).
- In-UI strategy editor / running the user's strategy from the site.
- Multi-bot per wallet (vary `accountIndex`).
- Hosted multi-tenant auth.
