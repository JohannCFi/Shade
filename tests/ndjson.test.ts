import { describe, it, expect } from "vitest";
import { ndjsonStream, parseNdjsonLines } from "../src/spy/ndjson.js";

async function* nums() { yield { a: 1 }; yield { b: 2 }; }

describe("ndjsonStream", () => {
  it("serializes an async iterable to newline-delimited JSON", async () => {
    const text = await new Response(ndjsonStream(nums())).text();
    expect(text).toBe('{"a":1}\n{"b":2}\n');
  });

  it("emits a final error line if the source throws", async () => {
    async function* bad() { yield { ok: 1 }; throw new Error("boom"); }
    const text = await new Response(ndjsonStream(bad())).text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ ok: 1 });
    expect(lines[1]).toEqual({ kind: "error", message: "boom" });
  });

  it("emits a final error line with message if source throws a non-Error (string)", async () => {
    async function* stringThrower() { throw "kaboom"; }
    const text = await new Response(ndjsonStream(stringThrower())).text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ kind: "error", message: "kaboom" });
  });
});

describe("parseNdjsonLines", () => {
  it("parses complete lines and keeps the partial remainder", () => {
    let { lines, rest } = parseNdjsonLines("", '{"a":1}\n{"b"');
    expect(lines).toEqual([{ a: 1 }]);
    expect(rest).toBe('{"b"');
    ({ lines, rest } = parseNdjsonLines(rest, ":2}\n"));
    expect(lines).toEqual([{ b: 2 }]);
    expect(rest).toBe("");
  });
});
