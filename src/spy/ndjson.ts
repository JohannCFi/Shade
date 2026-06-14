/**
 * Newline-delimited JSON over a fetch stream. `ndjsonStream` serializes any async
 * iterable to a ReadableStream (server); `parseNdjsonLines` re-assembles whole
 * lines from arbitrarily-chunked text (client). A source error is surfaced as a
 * final `{ kind: "error", message }` line rather than a torn stream.
 */
export function ndjsonStream(source: AsyncIterable<unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) { controller.close(); return; }
        controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", message: err instanceof Error ? err.message : String(err) }) + "\n"));
        controller.close();
      }
    },
  });
}

export function parseNdjsonLines(buffer: string, chunk: string): { lines: unknown[]; rest: string } {
  const parts = (buffer + chunk).split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts.filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  return { lines, rest };
}
