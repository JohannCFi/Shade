import { describe, it, expect } from "vitest";
import { createShadeAgent } from "../src/sdk/index.js";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";
// A real token address is required by the config but the constructor does no network
const TOKEN = "0x36CaaEda8b01Fde64ABDd4d68b09C68D4a8bE5F";

describe("ShadeAgent config guard", () => {
  it("throws when neither apiKey nor apiUrl is provided", () => {
    expect(() =>
      createShadeAgent({
        environment: "arc-testnet",
        token: TOKEN,
        mnemonic: TEST_MNEMONIC,
        // no apiKey, no apiUrl
      }),
    ).toThrow("ShadeAgent: provide apiKey (local mode) or apiUrl (remote mode)");
  });

  it("does NOT throw in remote mode (apiUrl only) and admin is undefined", () => {
    const agent = createShadeAgent({
      environment: "arc-testnet",
      token: TOKEN,
      mnemonic: TEST_MNEMONIC,
      apiUrl: "http://localhost:3001",
    });
    expect(agent.admin).toBeUndefined();
  });

  it("does NOT throw in local mode (apiKey only) and admin is defined", () => {
    const agent = createShadeAgent({
      environment: "arc-testnet",
      token: TOKEN,
      mnemonic: TEST_MNEMONIC,
      apiKey: "test-api-key",
    });
    expect(agent.admin).toBeDefined();
  });
});
