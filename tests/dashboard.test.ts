import { describe, it, expect } from "vitest";
import { computeDefaultFundAmount, botConnectSnippet } from "../src/dashboard/helpers.js";

describe("computeDefaultFundAmount", () => {
  it("deposits ~the whole wallet minus the gas reserve", () => {
    expect(computeDefaultFundAmount("5000000", "500000")).toBe("4500000");
  });
  it("returns 0 when the balance is below the reserve", () => {
    expect(computeDefaultFundAmount("300000", "500000")).toBe("0");
  });
  it("returns 0 for an empty wallet", () => {
    expect(computeDefaultFundAmount("0", "500000")).toBe("0");
  });
});

describe("botConnectSnippet", () => {
  it("produces a runnable @shade/pay snippet for the chosen env/token", () => {
    const s = botConnectSnippet({ environment: "arc-testnet", token: "0xTOKEN" });
    expect(s).toContain("createShadeAgent");
    expect(s).toContain("arc-testnet");
    expect(s).toContain("0xTOKEN");
    expect(s).toContain("payPrivate");
  });
  it("produces a remote (apiUrl) snippet with no admin key", () => {
    const s = botConnectSnippet({ environment: "arc-testnet", token: "0xTOKEN", apiUrl: "https://shade.vercel.app" });
    expect(s).toContain("createShadeAgent");
    expect(s).toContain("https://shade.vercel.app");
    expect(s).not.toContain("apiKey");
  });
});
