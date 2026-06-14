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
  it("rejects a future timestamp beyond clock-skew tolerance", async () => {
    const p = await payload(Date.now() + 130_000);
    expect(await verifyShadeAuth(p, { appId: APP_ID, chainId: CHAIN_ID })).toBeNull();
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
