# Per-user Bot Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any self-custody user run their own external bot against a deployed Shade — paying oracles privately via Unlink — without ever holding the project admin key, by authenticating the bot with a stateless wallet-signature proof.

**Architecture:** A pure `bot-auth` module owns a wire format + crypto for a two-signature proof (identity + freshness). The backend's existing `/api/unlink/*` routes verify the proof and scope token issuance to the proven address. The SDK gains a `apiUrl` "remote mode" that points the Unlink client at those routes (`registerUrl` + `authorizationToken.url` + a `customFetch` that injects the proof) and creates **no** admin client. Everything is additive: with no `apiUrl`, the SDK behaves exactly as today.

**Tech Stack:** TypeScript ESM (`.js` import specifiers), `@unlink-xyz/sdk`, viem, Next.js App Router (Node runtime), vitest (node env), jose (existing Dynamic JWT).

**Spec:** `docs/superpowers/specs/2026-06-14-per-user-bot-auth-design.md`

**Safety:** Work on branch `feat/per-user-auth`. `main` (frozen at `origin/main`) is the pitch fallback — never touched. If implementation stalls, the branch is simply not merged.

---

## File Structure

**New**
- `src/unlink/bot-auth.ts` — the whole auth primitive: message builders, header encode/decode, `buildShadeAuthHeader` (sign), `verifyShadeAuth` (recover+check), `makeAuthInjectingFetch`. Pure/IO-light, fully unit-tested.
- `tests/bot-auth.test.ts`, `tests/auth-routes.test.ts`.

**Modify**
- `src/unlink/auth-routes.ts` — `ShadeSession` gains `unlinkAddress?`; add exported `authenticateShadeRequest` + `authorizeShade` (testable); wire them into `createUnlinkAuthRoutes`. Closes the `authorizeUnlinkAddress: () => true` hole for the bot path; browser path unchanged.
- `src/sdk/index.ts` — add `apiUrl?` to config + remote-mode client build (no admin key). Admin-mode (no `apiUrl`) stays byte-for-byte as today.
- `src/dashboard/helpers.ts` — `botConnectSnippet` learns the `apiUrl` (remote) form.
- `app/app/page.tsx` — show the deployed API URL + the remote snippet (display only).
- `scripts/my-bot.ts` — if `SHADE_API_URL` is set, run in remote mode (for end-to-end testing).

**Untouched:** `/spy`, the dashboard deploy/fund/unplug logic, `reconstruct`, oracle routes, the in-process `node-client.ts`, and the admin-mode SDK path.

---

## Chunk 1: Auth core (`bot-auth.ts`, pure)

### Task 1: The `bot-auth` primitive

**Files:**
- Create: `src/unlink/bot-auth.ts`
- Test: `tests/bot-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mnemonicToAccount } from "viem/accounts";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import {
  encodeShadeAuth, decodeShadeAuth, verifyShadeAuth, buildShadeAuthHeader,
  makeAuthInjectingFetch, deriveSeedMessage, liveMessage, SHADE_AUTH_SCHEME,
  type ShadeAuthPayload,
} from "../src/unlink/bot-auth.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const APP_ID = "shade";
const CHAIN_ID = 5042002;

async function payload(ts = Date.now()): Promise<ShadeAuthPayload> {
  const signer = mnemonicToAccount(MNEMONIC);
  const deriveSig = await signer.signMessage({ message: deriveSeedMessage(APP_ID, CHAIN_ID) });
  const unlinkAddress = await unlinkAccount.fromEthereumSignature({ signature: deriveSig, appId: APP_ID, chainId: CHAIN_ID }).getAddress();
  const liveSig = await signer.signMessage({ message: liveMessage(unlinkAddress, ts) });
  return { deriveSig, unlinkAddress, ts, liveSig };
}

describe("bot-auth header", () => {
  it("round-trips encode/decode and rejects other schemes", async () => {
    const p = await payload();
    const h = encodeShadeAuth(p);
    expect(h.startsWith(`${SHADE_AUTH_SCHEME} `)).toBe(true);
    expect(decodeShadeAuth(h)).toEqual(p);
    expect(decodeShadeAuth("Bearer abc")).toBeNull();
    expect(decodeShadeAuth(null)).toBeNull();
  });
});

describe("verifyShadeAuth", () => {
  it("accepts a fresh valid proof → its unlink address", async () => {
    const p = await payload();
    const r = await verifyShadeAuth(p, { appId: APP_ID, chainId: CHAIN_ID });
    expect(r?.unlinkAddress).toBe(p.unlinkAddress);
  });
  it("rejects a stale timestamp", async () => {
    const p = await payload(Date.now() - 10 * 60_000);
    expect(await verifyShadeAuth(p, { appId: APP_ID, chainId: CHAIN_ID })).toBeNull();
  });
  it("rejects a tampered unlinkAddress", async () => {
    const p = await payload();
    expect(await verifyShadeAuth({ ...p, unlinkAddress: "unlink1qqtampered00000000000000000000000000" }, { appId: APP_ID, chainId: CHAIN_ID })).toBeNull();
  });
  it("rejects a liveSig from a different signer", async () => {
    const p = await payload();
    const liveSig = await mnemonicToAccount(OTHER).signMessage({ message: liveMessage(p.unlinkAddress, p.ts) });
    expect(await verifyShadeAuth({ ...p, liveSig }, { appId: APP_ID, chainId: CHAIN_ID })).toBeNull();
  });
});

describe("buildShadeAuthHeader", () => {
  it("produces a header that verifyShadeAuth accepts", async () => {
    const h = await buildShadeAuthHeader(mnemonicToAccount(MNEMONIC), { appId: APP_ID, chainId: CHAIN_ID });
    const p = decodeShadeAuth(h)!;
    const v = await verifyShadeAuth(p, { appId: APP_ID, chainId: CHAIN_ID });
    expect(v?.unlinkAddress).toBe(p.unlinkAddress);
  });
});

describe("makeAuthInjectingFetch", () => {
  it("adds the auth header only to apiUrl requests", async () => {
    const seen: Record<string, string | null> = {};
    const fake = (async (input: any, init: any) => {
      const url = typeof input === "string" ? input : input.url;
      seen[url] = new Headers(init?.headers).get("authorization");
      return new Response("{}");
    }) as unknown as typeof fetch;
    const f = makeAuthInjectingFetch("https://app.example.com", async () => "ShadeSig xyz", fake);
    await f("https://app.example.com/api/unlink/register", { method: "POST" });
    await f("https://engine.unlink.xyz/v1/transfer", { method: "POST" });
    expect(seen["https://app.example.com/api/unlink/register"]).toBe("ShadeSig xyz");
    expect(seen["https://engine.unlink.xyz/v1/transfer"]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot-auth.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/unlink/bot-auth.ts`**

```ts
import { recoverMessageAddress } from "viem";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";

/**
 * Stateless wallet-signature auth for external bots. A bot proves it owns its
 * Unlink address with two signatures from its EVM wallet — an identity proof
 * (the deterministic derive-seed signature, which maps to the Unlink address)
 * and a freshness proof (a timestamped message). The backend verifies both and
 * issues Unlink tokens only for the proven address. No admin key, no DB.
 */
export const SHADE_AUTH_SCHEME = "ShadeSig";
export const DEFAULT_MAX_AGE_MS = 120_000;

export interface ShadeAuthPayload {
  deriveSig: `0x${string}`;
  unlinkAddress: string;
  ts: number;
  liveSig: `0x${string}`;
}

export interface MessageSigner {
  signMessage(args: { message: string }): Promise<`0x${string}`>;
}

export function deriveSeedMessage(appId: string, chainId: number): string {
  return buildDeriveSeedMessage({ appId, chainId });
}
export function liveMessage(unlinkAddress: string, ts: number): string {
  return `Shade-Auth:${unlinkAddress}:${ts}`;
}

export function encodeShadeAuth(payload: ShadeAuthPayload): string {
  return `${SHADE_AUTH_SCHEME} ${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

export function decodeShadeAuth(header: string | null): ShadeAuthPayload | null {
  if (!header?.startsWith(`${SHADE_AUTH_SCHEME} `)) return null;
  try {
    const json = Buffer.from(header.slice(SHADE_AUTH_SCHEME.length + 1), "base64").toString("utf8");
    const p = JSON.parse(json) as ShadeAuthPayload;
    if (typeof p?.deriveSig === "string" && typeof p?.unlinkAddress === "string" &&
        typeof p?.ts === "number" && typeof p?.liveSig === "string") return p;
    return null;
  } catch {
    return null;
  }
}

/** Build the proof header by signing with the bot's wallet. */
export async function buildShadeAuthHeader(
  signer: MessageSigner,
  opts: { appId: string; chainId: number; now?: number },
): Promise<string> {
  const deriveSig = await signer.signMessage({ message: deriveSeedMessage(opts.appId, opts.chainId) });
  const unlinkAddress = await unlinkAccount
    .fromEthereumSignature({ signature: deriveSig, appId: opts.appId, chainId: opts.chainId })
    .getAddress();
  const ts = opts.now ?? Date.now();
  const liveSig = await signer.signMessage({ message: liveMessage(unlinkAddress, ts) });
  return encodeShadeAuth({ deriveSig, unlinkAddress, ts, liveSig });
}

/** Verify a proof. Returns the proven Unlink address, or null if invalid. */
export async function verifyShadeAuth(
  payload: ShadeAuthPayload,
  opts: { appId: string; chainId: number; maxAgeMs?: number; now?: number },
): Promise<{ unlinkAddress: string } | null> {
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = opts.now ?? Date.now();
  if (!Number.isFinite(payload.ts) || Math.abs(now - payload.ts) > maxAge) return null;

  let signer1: string;
  let derived: string;
  try {
    signer1 = await recoverMessageAddress({ message: deriveSeedMessage(opts.appId, opts.chainId), signature: payload.deriveSig });
    derived = await unlinkAccount.fromEthereumSignature({ signature: payload.deriveSig, appId: opts.appId, chainId: opts.chainId }).getAddress();
  } catch {
    return null;
  }
  if (derived !== payload.unlinkAddress) return null;

  let signer2: string;
  try {
    signer2 = await recoverMessageAddress({ message: liveMessage(payload.unlinkAddress, payload.ts), signature: payload.liveSig });
  } catch {
    return null;
  }
  if (signer1.toLowerCase() !== signer2.toLowerCase()) return null;

  return { unlinkAddress: payload.unlinkAddress };
}

/**
 * A `fetch` wrapper that attaches a freshly-built auth header to requests aimed
 * at `apiUrl` (the Shade backend) and passes every other request (e.g. the Unlink
 * Engine) through untouched.
 */
export function makeAuthInjectingFetch(
  apiUrl: string,
  authHeader: () => Promise<string>,
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith(apiUrl)) {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", await authHeader());
      return baseFetch(input, { ...init, headers });
    }
    return baseFetch(input, init);
  }) as typeof globalThis.fetch;
}
```

> Note: confirm `recoverMessageAddress` and `mnemonicToAccount(...).signMessage` are from the project's `viem`, and `unlinkAccount.fromEthereumSignature(...).getAddress()` is async (it is — see `scripts/check-activity.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bot-auth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, clean.

- [ ] **Step 6: Commit**

```bash
git add src/unlink/bot-auth.ts tests/bot-auth.test.ts
git commit -m "feat(auth): stateless wallet-signature proof for external bots"
```

---

## Chunk 2: Backend — verify the proof, scope tokens

### Task 2: Wire `bot-auth` into the Unlink auth routes

**Files:**
- Modify: `src/unlink/auth-routes.ts`
- Test: `tests/auth-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mnemonicToAccount } from "viem/accounts";
import { buildShadeAuthHeader } from "../src/unlink/bot-auth.js";
import { authenticateShadeRequest, authorizeShade } from "../src/unlink/auth-routes.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const CHAIN_ID = 5042002;

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/unlink/authorization-token", { method: "POST", headers });
}

describe("authenticateShadeRequest", () => {
  it("resolves a ShadeSig header to a session bound to the unlink address", async () => {
    const header = await buildShadeAuthHeader(mnemonicToAccount(MNEMONIC), { appId: "shade", chainId: CHAIN_ID });
    const session = await authenticateShadeRequest(req({ authorization: header }), CHAIN_ID);
    expect(session.unlinkAddress).toBeTruthy();
    expect(session.userId).toBe(session.unlinkAddress);
  });
  it("falls back to the demo session when no proof is present", async () => {
    const session = await authenticateShadeRequest(req({}), CHAIN_ID);
    expect(session.unlinkAddress).toBeUndefined();
    expect(session.userId).toBe("demo-user");
  });
  it("rejects an invalid ShadeSig header", async () => {
    await expect(authenticateShadeRequest(req({ authorization: "ShadeSig bm90anNvbg==" }), CHAIN_ID)).rejects.toThrow();
  });
});

describe("authorizeShade", () => {
  it("only allows a bot session to act on its own address", () => {
    expect(authorizeShade({ userId: "u", unlinkAddress: "unlink1ABC" }, "unlink1abc")).toBe(true);
    expect(authorizeShade({ userId: "u", unlinkAddress: "unlink1ABC" }, "unlink1xyz")).toBe(false);
  });
  it("preserves current behavior for non-bot (browser/demo) sessions", () => {
    expect(authorizeShade({ userId: "demo-user" }, "unlink1anything")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: FAIL (`authenticateShadeRequest`/`authorizeShade` not exported).

- [ ] **Step 3: Modify `src/unlink/auth-routes.ts`**

Add imports at the top:
```ts
import { resolveChain } from "../chain/chains.js";
import { UNLINK_APP_ID } from "./app-id.js";
import { decodeShadeAuth, verifyShadeAuth } from "./bot-auth.js";
```

Extend the session type:
```ts
export interface ShadeSession {
  userId: string;
  /** Set when the caller authenticated with a ShadeSig wallet proof (a bot). */
  unlinkAddress?: string;
}
```

Add the two exported, testable functions (above `getUnlinkAuthRoutes`):
```ts
/**
 * Resolve the app session for an Unlink auth route request:
 *  1. a ShadeSig wallet proof (external bot) → session bound to the proven address;
 *  2. else a Dynamic session JWT;
 *  3. else the demo fallback (browser today). PROD could reject here instead.
 */
export async function authenticateShadeRequest(request: Request, chainId: number): Promise<ShadeSession> {
  const authz = request.headers.get("authorization");
  const proof = decodeShadeAuth(authz);
  if (proof) {
    const v = await verifyShadeAuth(proof, { appId: UNLINK_APP_ID, chainId });
    if (!v) throw new Error("invalid Shade auth proof");
    return { userId: v.unlinkAddress, unlinkAddress: v.unlinkAddress };
  }
  const verified = await verifyDynamicToken(authz);
  if (verified) return verified;
  return { userId: request.headers.get("x-shade-user") ?? "demo-user" };
}

/** A bot session may only receive tokens for its own address; others unchanged. */
export function authorizeShade(session: ShadeSession, unlinkAddress: string): boolean {
  return session.unlinkAddress
    ? session.unlinkAddress.toLowerCase() === unlinkAddress.toLowerCase()
    : true;
}
```

Rewire the route options to use them (replace the inline `authenticate` and the `authorizeUnlinkAddress: async () => true`):
```ts
  const chainId = resolveChain(process.env.UNLINK_ENVIRONMENT ?? "arc-testnet").chainId;

  cached = createUnlinkAuthRoutes<ShadeSession>({
    admin,
    authenticate: (request) => authenticateShadeRequest(request, chainId),
    onRegister: async () => {
      // TODO(future): persist app-user -> unlink-address mapping.
    },
    authorizeUnlinkAddress: async ({ session, unlinkAddress }) => authorizeShade(session, unlinkAddress),
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: PASS (5 tests). (The ShadeSig + demo branches need no network; the Dynamic branch is not exercised here.)

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, clean. (Existing browser behavior preserved: no proof + no Dynamic token ⇒ `demo-user`, `authorizeShade` ⇒ true.)

- [ ] **Step 6: Commit**

```bash
git add src/unlink/auth-routes.ts tests/auth-routes.test.ts
git commit -m "feat(auth): verify bot proofs and scope token issuance to the owner"
```

---

## Chunk 3: SDK remote mode (no admin key)

### Task 3: Add `apiUrl` remote mode to `createShadeAgent`

**Files:**
- Modify: `src/sdk/index.ts`

**Context:** Today `ShadeAgent` always builds `createUnlinkAdmin` (holds the key) and derives the account via `fromEthereumSignature` (from the earlier signature fix). Add an `apiUrl` branch: build the Unlink client pointed at the deployed routes with an auth-injecting fetch, and create **no** admin. The Unlink SDK supports this directly via `registerUrl`, `authorizationToken.url`, and `customFetch` (`CreateUnlinkClientOptions`).

- [ ] **Step 1: Extend the config**

In `ShadeAgentConfig`, make `apiKey` optional and add `apiUrl`:
```ts
  /** Unlink project/admin API key. Required for admin (local) mode; omit in remote mode. */
  apiKey?: string;
  /** Deployed Shade URL. When set, the bot uses the backend routes (no admin key). */
  apiUrl?: string;
```

- [ ] **Step 2: Guard + store in the constructor**

Replace the admin creation so it only happens in admin mode:
```ts
    if (!cfg.mnemonic && !cfg.privateKey) {
      throw new Error("ShadeAgent: provide a mnemonic or a privateKey");
    }
    if (!cfg.apiUrl && !cfg.apiKey) {
      throw new Error("ShadeAgent: provide apiKey (local mode) or apiUrl (remote mode)");
    }
```
Add fields: `private readonly apiUrl?: string;` and make `admin` possibly undefined: `readonly admin?: UnlinkAdmin;`. Store `this.apiUrl = cfg.apiUrl;` and only `this.admin = cfg.apiUrl ? undefined : createUnlinkAdmin({ environment: this.environment, apiKey: cfg.apiKey! });`. Keep `evmSigner`, `evmProvider`, `chainId`, etc. as they are.

- [ ] **Step 3: Branch `buildClient()` by mode**

Import the auth helpers:
```ts
import { buildShadeAuthHeader, makeAuthInjectingFetch } from "../unlink/bot-auth.js";
```
In `buildClient()`, after deriving `account` (unchanged), branch:
```ts
    if (this.apiUrl) {
      const apiUrl = this.apiUrl;
      const signer = this.evmSigner;
      const chainId = this.chainId;
      const authHeader = () => buildShadeAuthHeader(signer, { appId: UNLINK_APP_ID, chainId });
      return createUnlinkClient({
        environment: this.environment,
        account,
        evm: this.evmProvider,
        registerUrl: `${apiUrl}/api/unlink/register`,
        authorizationToken: { url: `${apiUrl}/api/unlink/authorization-token` },
        customFetch: makeAuthInjectingFetch(apiUrl, authHeader),
      });
    }
    // admin mode (unchanged):
    return createUnlinkClient({
      environment: this.environment,
      account,
      evm: this.evmProvider,
      register: (payload) => this.admin!.users.register(payload),
      authorizationToken: { provider: async (ctx) => {
        const tok = await this.admin!.authorizationTokens.issue({ unlinkAddress: ctx.unlinkAddress });
        return { token: tok.token, expiresAt: tok.expiresAt };
      } },
    });
```
(Import `UNLINK_APP_ID` is already present from the earlier fix.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Verify `createUnlinkClient` accepts `registerUrl` / `authorizationToken.url` / `customFetch` — it does per `CreateUnlinkClientOptions`.)

- [ ] **Step 5: Full suite**

Run: `npx vitest run`
Expected: 48+ green; admin-mode unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/sdk/index.ts
git commit -m "feat(sdk): remote mode (apiUrl) — pay via backend routes, no admin key"
```

---

## Chunk 4: Dashboard snippet + runnable remote bot

### Task 4: Remote snippet in `botConnectSnippet`

**Files:**
- Modify: `src/dashboard/helpers.ts`
- Test: `tests/dashboard.test.ts`

- [ ] **Step 1: Write the failing test (extend the existing describe)**

Add to `tests/dashboard.test.ts`:
```ts
  it("produces a remote (apiUrl) snippet with no admin key", () => {
    const s = botConnectSnippet({ environment: "arc-testnet", token: "0xTOKEN", apiUrl: "https://shade.vercel.app" });
    expect(s).toContain("createShadeAgent");
    expect(s).toContain("https://shade.vercel.app");
    expect(s).not.toContain("apiKey");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL (apiUrl not supported).

- [ ] **Step 3: Update `botConnectSnippet`**

```ts
export function botConnectSnippet(opts: { environment: string; token: string; apiUrl?: string }): string {
  if (opts.apiUrl) {
    return `import { createShadeAgent } from "@shade/pay";

// Remote mode: your bot authenticates with its own wallet — NO admin key.
const shade = createShadeAgent({
  environment: "${opts.environment}",
  apiUrl: "${opts.apiUrl}",                  // your deployed Shade
  token: "${opts.token}",                    // USDC
  privateKey: process.env.BOT_WALLET_PRIVATE_KEY!, // THIS wallet's key (dedicated to the bot)
});

await shade.payPrivate(oracleAddress, "0.001"); // private, invisible on-chain`;
  }
  return `import { createShadeAgent } from "@shade/pay";

// Same wallet you connected here = the SAME private bot identity.
const shade = createShadeAgent({
  environment: "${opts.environment}",
  apiKey: process.env.SHADE_API_KEY!,        // your Shade/Unlink project key
  token: "${opts.token}",                    // USDC
  mnemonic: process.env.BOT_WALLET_MNEMONIC!, // THIS wallet's key (dedicated to the bot)
});

await shade.payPrivate(oracleAddress, "0.001"); // private, invisible on-chain`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/helpers.ts tests/dashboard.test.ts
git commit -m "feat(app): remote (apiUrl) bot snippet — no admin key"
```

---

### Task 5: Show the remote snippet in the dashboard

**Files:**
- Modify: `app/app/page.tsx`

> No unit test (UI; repo vitest is node-only).

- [ ] **Step 1: Read the deployed URL and pass it to the snippet**

Add near the other constants in `app/app/page.tsx`:
```ts
const APP_URL = process.env.NEXT_PUBLIC_SHADE_APP_URL ?? "";
```
In the "Connect your external bot" card, change the snippet call to prefer remote when a URL is configured:
```tsx
{botConnectSnippet({ environment: "arc-testnet", token: BROWSER_TOKEN, apiUrl: APP_URL || undefined })}
```
And update the card hint:
```tsx
<p className="hint !mt-0 mb-3">Run your bot anywhere with this wallet — it authenticates with its own key, no admin key needed.</p>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/app/page.tsx
git commit -m "feat(app): surface the remote bot snippet + deployed URL"
```

---

### Task 6: Remote mode in `scripts/my-bot.ts` (for end-to-end testing)

**Files:**
- Modify: `scripts/my-bot.ts`

- [ ] **Step 1: Use remote mode when `SHADE_API_URL` is set**

In the `createShadeAgent({...})` call, add:
```ts
    ...(process.env.SHADE_API_URL ? { apiUrl: process.env.SHADE_API_URL } : { apiKey: config.apiKey }),
```
and remove the standalone `apiKey: config.apiKey,` line (now conditional). Keep everything else.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add scripts/my-bot.ts
git commit -m "chore(bot): support remote mode via SHADE_API_URL for testing"
```

---

## Chunk 5: End-to-end verification + deployment

### Task 7: Verify remote mode locally, then note Vercel

**Files:** none (verification).

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` (note the port, e.g. 3001).

- [ ] **Step 2: Run the bot in REMOTE mode against it**

Run (PowerShell): `$env:SHADE_API_URL="http://localhost:3001"; npx tsx scripts/my-bot.ts --ticks 2`
Expected: the bot derives `unlink1…`, makes private transfers **through the local routes** (no admin key used by the bot), budget drops. Confirm in `/app` (Refresh) that the transfers appear — i.e. same identity end-to-end.

- [ ] **Step 3: Confirm the negative path**

Temporarily tamper (e.g., point `SHADE_API_URL` at the app but hack the header) — out of scope to script; instead confirm via `tests/auth-routes.test.ts` that an invalid proof is rejected and a mismatched address is unauthorized.

- [ ] **Step 4: Vercel deployment notes (document, do not deploy from the agent)**

Add a short `## Deploy (Vercel)` section to `README.md` listing the required env vars (`UNLINK_API_KEY`, `UNLINK_ENVIRONMENT`, `UNLINK_TEST_TOKEN`, `UNLINK_TOKEN_DECIMALS`, `WALLET_MNEMONIC`, `RPC_URL`, `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`, `NEXT_PUBLIC_UNLINK_*`, `NEXT_PUBLIC_SHADE_APP_URL`) and the fact that the bot needs only `SHADE_API_URL` + its own `BOT_WALLET_PRIVATE_KEY` (no admin key). Commit.

```bash
git add README.md
git commit -m "docs: Vercel env + remote bot usage"
```

- [ ] **Step 5: Decide on merge (human)**

The branch is additive and `main` is untouched. Merge to `main` only after the human confirms the remote e2e works; otherwise keep the branch for later and pitch `main`.

---

## Done criteria
- `npx vitest run` green (new `bot-auth` + `auth-routes` tests + existing suite).
- A bot with **only** `apiUrl` + its wallet key makes a real private payment via the deployed routes; **no admin key** in the bot.
- `authorizeShade` blocks tokens for any address other than the proven one.
- With no `apiUrl`, the SDK + dashboard + `/spy` behave exactly as on `main` (pitch fallback intact).
