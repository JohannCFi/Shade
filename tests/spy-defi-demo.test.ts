import { describe, it, expect } from "vitest";
import { reconstruct } from "../src/spy/reconstruct.js";
import { runTransparentAgentStream, type TransparentRunIO } from "../src/spy/transparent-run.js";
import type { RunEvent } from "../src/spy/run-events.js";
import type { DemoVenue } from "../src/defi/demo-registry.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const TOKEN = "0x3600000000000000000000000000000000000000";

const AGENT = "0x1111111111111111111111111111111111111111";
const ORACLE = "0x2222222222222222222222222222222222222222";
const VAULT = "0x4e22a0c79b16a48512d80fdb19f98ab9f42f30a9";

describe("reconstruct with DeFi venues", () => {
  it("separates capital allocations from oracle queries and names the venue", () => {
    const report = reconstruct({
      agentAddress: AGENT,
      payments: [
        { from: "0xfunder", to: AGENT, amount: "1000000" }, // funding
        { from: AGENT, to: ORACLE, amount: "1000" }, // oracle query
        { from: AGENT, to: VAULT, amount: "50000" }, // capital allocation
      ],
      knownOracles: { [ORACLE.toLowerCase()]: "ETH price" },
      knownVenues: { [VAULT.toLowerCase()]: "Yield vault" },
    });
    expect(report.oracles).toHaveLength(1);
    expect(report.allocations).toHaveLength(1);
    expect(report.allocations[0]).toMatchObject({ label: "Yield vault", amount: "50000" });
    expect(report.inferredStrategy).toContain("Yield vault");
    expect(report.inferredStrategy).toContain("ETH price");
  });

  it("leaves allocations empty when no venue edges are present", () => {
    const report = reconstruct({
      agentAddress: AGENT,
      payments: [{ from: AGENT, to: ORACLE, amount: "1000" }],
      knownOracles: { [ORACLE.toLowerCase()]: "ETH price" },
    });
    expect(report.allocations).toEqual([]);
  });
});

describe("transparent rail allocation phase", () => {
  const venues: DemoVenue[] = [
    {
      id: "demo-vault",
      kind: "vault4626",
      label: "Yield vault",
      venueAddress: VAULT,
      entry: { kind: "vault4626", cfg: { vault: VAULT, asset: TOKEN, requiresUngatedVault: true } },
    },
  ];

  function fakeIo(): TransparentRunIO {
    return {
      agent: "0x0000000000000000000000000000000000000006",
      fund: async () => "0xfund" as `0x${string}`,
      payOracle: async () => "0xpay" as `0x${string}`,
      allocate: async () => "0xtrade" as `0x${string}`,
    };
  }

  it("emits a trade event per venue after the ticks", async () => {
    const events: RunEvent[] = [];
    for await (const e of runTransparentAgentStream({ mnemonic: MNEMONIC, token: TOKEN, ticks: 1, venues }, fakeIo())) {
      events.push(e);
    }
    const trades = events.filter((e): e is Extract<RunEvent, { kind: "trade" }> => e.kind === "trade");
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ label: "Yield vault", primitive: "vault4626", venue: VAULT, hash: "0xtrade" });
    // trade comes after the decide
    const kinds = events.map((e) => e.kind);
    expect(kinds.indexOf("trade")).toBeGreaterThan(kinds.indexOf("decide"));
  });

  it("skips trades when the IO has no allocate (back-compat)", async () => {
    const io = fakeIo();
    delete (io as { allocate?: unknown }).allocate;
    const events: RunEvent[] = [];
    for await (const e of runTransparentAgentStream({ mnemonic: MNEMONIC, token: TOKEN, ticks: 1, venues }, io)) {
      events.push(e);
    }
    expect(events.some((e) => e.kind === "trade")).toBe(false);
  });
});
