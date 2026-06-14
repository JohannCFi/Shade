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
