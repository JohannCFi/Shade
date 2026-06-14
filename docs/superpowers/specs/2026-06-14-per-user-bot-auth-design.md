# Per-user bot auth — plug any bot without the admin key (design)

**Date:** 2026-06-14 · **Branch:** `feat/per-user-auth`

## Goal
Let **any user run their own external bot** against a **deployed** Shade, paying
oracles privately via Unlink, **without ever holding the project admin key**. The
bot authenticates with **its own wallet signature**; the backend (which holds the
admin key) issues Unlink authorization tokens **scoped to that user's address only**.

## Non-goals / hard constraints
- **Change nothing in the current experience.** `/spy`, `/app`, the in-repo demo,
  `scripts/my-bot.ts` (admin-key mode), and the browser dashboard flow must keep
  working **exactly as today** (this is the pitch fallback). The work is **purely
  additive**.
- **Do not force Dynamic into the bot.** Dynamic already qualifies (dashboard
  wallet connect); adding it to a headless bot is friction for zero track gain.
- **No database.** Auth is stateless so it deploys on **Vercel** as-is.
- Embedded-wallet (email) users still can't run a *headless* bot (they don't hold a
  key) — unchanged and out of scope. The bot path targets **self-custody** users.

## Current state (what already exists)
- `app/api/unlink/register` and `app/api/unlink/authorization-token` already proxy
  to the Unlink **admin** (which holds `UNLINK_API_KEY`) via `getUnlinkAuthRoutes()`
  (`src/unlink/auth-routes.ts` → `createUnlinkAuthRoutes`). **The browser never
  holds the admin key** — it goes through these routes.
- Two gaps: `authorizeUnlinkAddress` returns `true` (anyone can request a token for
  any address — a privacy leak), and `authenticate` has a `demo-user` fallback.
- The **SDK** `createShadeAgent` (`src/sdk/index.ts`) builds `createUnlinkAdmin`
  **directly** → holds the admin key. This is the only thing that blocks shipping
  "bring your own bot".

## Architecture — stateless wallet-signature auth
The bot proves ownership of its Unlink address with **two signatures from its EVM
wallet** (no admin key, no Dynamic, no server state):

1. **Identity proof** — `deriveSig = wallet.sign(buildDeriveSeedMessage{appId,chainId})`.
   Deterministic; the backend re-derives the Unlink address from it
   (`account.fromEthereumSignature`) and recovers the EVM signer
   (`viem.recoverMessageAddress`). This *binds* EVM wallet ↔ Unlink address.
2. **Freshness proof** — `liveSig = wallet.sign("Shade-Auth:<unlinkAddress>:<ts>")`.
   Recovers to the same EVM signer and carries a recent timestamp → blocks replay
   outside a short window (default **120 s**).

The bot sends both (+ `ts`) as an `Authorization: ShadeSig <base64(json)>` header on
every `/api/unlink/*` call. Stateless: the server verifies signatures and time,
derives the address, and only issues tokens for **that** address.

## Components / boundaries

**New: `src/unlink/bot-auth.ts`** (pure, unit-tested)
- `buildShadeAuthHeader({ deriveSig, unlinkAddress, ts, liveSig }) → string` and
  `decodeShadeAuth(header) → payload | null` — the wire format.
- `verifyShadeAuth(payload, { appId, chainId, maxAgeMs }) → { unlinkAddress } | null`
  — recovers both signers, checks they match, re-derives the address, checks the
  timestamp. **No I/O** → fully testable with fixed signatures.

**Modify: `src/unlink/auth-routes.ts`**
- `authenticate`: if a `ShadeSig` header is present → `verifyShadeAuth` → session
  `{ userId: unlinkAddress, unlinkAddress }`. Else keep the **existing** behavior
  (Dynamic JWT, then demo fallback) so the browser path is untouched.
- `authorizeUnlinkAddress(session, requested)`: if the session has an
  `unlinkAddress` (ShadeSig), return `requested === session.unlinkAddress`. Else
  preserve current behavior. This closes the hole **for the bot path** without
  breaking the browser.

**Modify: `src/sdk/index.ts`** — add a **remote mode** to `ShadeAgent`
- New config: `apiUrl?: string`. When set, the SDK does **not** create
  `createUnlinkAdmin`. Instead it builds the Unlink client so that registration and
  authorization-token fetches go to `${apiUrl}/api/unlink/*` with the `ShadeSig`
  header (via the SDK's `registerUrl`/`customFetch` + the `authorizationToken`
  provider). The **spending key never leaves the bot**; only signatures + public
  registration material are sent.
- When `apiUrl` is **absent**, behavior is **exactly as today** (admin key, in-process).
  → backward compatible; `scripts/my-bot.ts` and existing callers unchanged.

**Modify: `app/app/page.tsx`** (additive UI)
- In the "Connect your external bot" card, show the **deployed API URL** and an
  updated snippet using `createShadeAgent({ apiUrl, mnemonic|privateKey })` (no
  admin key). Pure display; no behavior change to the dashboard.

**Modify: `src/dashboard/helpers.ts`** — `botConnectSnippet` gains the `apiUrl`
form (remote mode). Keep the asserted substrings so `tests/dashboard.test.ts` stays
green.

## Data flow (bot, remote mode)
```
bot: createShadeAgent({ apiUrl, privateKey })
  → derive identity locally (fromEthereumSignature) — spending key stays local
  → build ShadeSig header (deriveSig + liveSig + ts)
  → client.ensureRegistered()
       POST {apiUrl}/api/unlink/register   (payload + ShadeSig)
         backend: authenticate → verifyShadeAuth → {unlinkAddress}
                  authorizeUnlinkAddress(payload.address == unlinkAddress) ✓
                  admin.users.register(payload)        ← admin key, server-side
  → client.transfer(...) needs a token
       POST {apiUrl}/api/unlink/authorization-token  ({unlinkAddress} + ShadeSig)
         backend: authenticate + authorizeUnlinkAddress ✓
                  admin.authorizationTokens.issue(...) ← admin key, server-side
  → private transfer settles in the Unlink pool (no admin key ever left the server)
```

## Security analysis
- **Admin key**: never leaves the server in remote mode. ✓
- **Token scoping**: `authorizeUnlinkAddress` enforces `requested == proven address`
  → a bot can only act on **its own** account; it cannot read or touch another
  user's. Closes the current blanket-`true` hole for the bot path. ✓
- **Replay**: `liveSig` timestamp bounds the window (120 s) + HTTPS. Acceptable for
  testnet/MVP. A nonce/challenge store (Vercel KV) would remove it entirely — noted
  as a future hardening, **out of scope** now.
- **Spending**: an issued token authorizes API access for an address but **cannot
  spend** — spending needs the account's spending key, which only the bot holds.
- **Browser path**: unchanged (keeps Dynamic-JWT-or-demo fallback). Optionally, a
  later task can have the browser attach a `ShadeSig` built from its existing deploy
  signature (no new prompt) to close the legacy hole too — **optional**, not required.

## Backward compatibility
- `apiUrl` absent ⇒ admin-key mode ⇒ identical to today. All existing scripts/tests
  pass. The browser dashboard is untouched. `main` is the frozen pitch version.

## Testing
- `tests/bot-auth.test.ts` (pure): sign with a fixed viem account, build the header,
  `verifyShadeAuth` returns the expected `unlinkAddress`; reject (a) tampered sigs,
  (b) mismatched signers, (c) stale timestamp.
- `tests/dashboard.test.ts`: extend for the `apiUrl` snippet variant (keep existing
  assertions).
- Manual: run a bot in **remote mode** against the local dev server with `apiUrl=
  http://localhost:3001`, confirm a private transfer lands and appears in `/app`.
- Regression: full `vitest run` green; `scripts/my-bot.ts` (admin mode) still works.

## Deployment (Vercel)
- Env vars on Vercel: `UNLINK_API_KEY`, `UNLINK_ENVIRONMENT`, `UNLINK_TEST_TOKEN`,
  `UNLINK_TOKEN_DECIMALS`, `WALLET_MNEMONIC` (for the in-app demo/oracles), `RPC_URL`,
  the `NEXT_PUBLIC_*` (Dynamic + token), and `SHADE_PUBLIC_APP_URL` (for the snippet).
- No new managed services (stateless). The deployed URL becomes the bot's `apiUrl`.

## Out of scope (YAGNI)
- Nonce/challenge store, rate limiting, per-user dashboards/accounts.
- Server-side execution for embedded-wallet users (delegated session keys).
- Closing the browser-path legacy fallback (optional follow-up).
