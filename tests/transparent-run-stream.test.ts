import { describe, it, expect } from "vitest";
import {
  runTransparentAgentStream,
  runTransparentAgent,
  type TransparentRunIO,
} from "../src/spy/transparent-run.js";
import type { RunEvent } from "../src/spy/run-events.js";

// Standard throwaway test mnemonic — only used to derive deterministic oracle addrs.
const MNEMONIC = "test test test test test test test test test test test junk";
const TOKEN = "0x3600000000000000000000000000000000000000";

function fakeIo(): TransparentRunIO {
  let n = 0;
  return {
    agent: "0x0000000000000000000000000000000000000006",
    fund: async () => "0xfund" as `0x${string}`,
    payOracle: async () => (`0xpay${n++}` as `0x${string}`),
  };
}

async function collect(ticks: number): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of runTransparentAgentStream({ mnemonic: MNEMONIC, token: TOKEN, ticks }, fakeIo())) {
    out.push(e);
  }
  return out;
}

describe("runTransparentAgentStream", () => {
  it("emits start → fund → (pay ETH, pay BTC, decide)×ticks → done", async () => {
    const kinds = (await collect(2)).map((e) => e.kind);
    expect(kinds).toEqual([
      "start", "fund",
      "pay", "pay", "decide",
      "pay", "pay", "decide",
      "done",
    ]);
  });

  it("carries deterministic decision data on each decide event", async () => {
    const decides = (await collect(2)).filter((e): e is Extract<RunEvent, { kind: "decide" }> => e.kind === "decide");
    expect(decides).toHaveLength(2);
    expect(typeof decides[0].ethPrice).toBe("number");
    expect(decides[0].action).toBe("HOLD");
  });

  it("clamps ticks into [1,5]", async () => {
    const count = async (t: number) => (await collect(t)).filter((e) => e.kind === "decide").length;
    expect(await count(0)).toBe(1);
    expect(await count(99)).toBe(5);
  });

  it("runTransparentAgent drains the stream to { agent, ticks }", async () => {
    const res = await runTransparentAgent({ mnemonic: MNEMONIC, token: TOKEN, ticks: 3 }, fakeIo());
    expect(res.ticks).toBe(3);
    expect(res.agent).toBe("0x0000000000000000000000000000000000000006");
  });
});
