import type { ObservablePayment, OracleUsage, SpyReport } from "./types.js";

export interface ReconstructInput {
  /** The agent address the spy is profiling. */
  agentAddress: string;
  /** All payments a chain observer can see touching the agent. */
  payments: ObservablePayment[];
  /** Optional address(lowercased)→label map to humanize known oracles. */
  knownOracles?: Record<string, string>;
}

/**
 * Reconstruct what a competitor learns about an agent from observable payments.
 *
 * Transparent rail → outgoing agent→oracle payments are visible, so we recover
 * the payer, the funder (incoming), which oracles it queries (→ strategy) and
 * the budget. Unlink rail → no outgoing payments are observable, so the report
 * is empty/unreadable. Pure function: no I/O.
 */
export function reconstruct(input: ReconstructInput): SpyReport {
  const agent = input.agentAddress.toLowerCase();
  const outgoing = input.payments.filter((p) => p.from.toLowerCase() === agent);
  const incoming = input.payments.filter((p) => p.to.toLowerCase() === agent);

  const byOracle = new Map<string, OracleUsage>();
  let totalSpent = 0n;
  for (const p of outgoing) {
    const key = p.to.toLowerCase();
    const existing = byOracle.get(key);
    const usage: OracleUsage = existing ?? {
      oracle: p.to,
      label: input.knownOracles?.[key],
      calls: 0,
      totalSpent: "0",
    };
    usage.calls += 1;
    usage.totalSpent = (BigInt(usage.totalSpent) + BigInt(p.amount)).toString();
    byOracle.set(key, usage);
    totalSpent += BigInt(p.amount);
  }

  const oracles = [...byOracle.values()].sort((a, b) => b.calls - a.calls);
  const readable = outgoing.length > 0;

  return {
    readable,
    payer: readable ? input.agentAddress : null,
    funder: incoming.length > 0 ? incoming[0].from : null,
    oracles,
    totalSpent: totalSpent.toString(),
    inferredStrategy: readable ? inferStrategy(oracles) : null,
  };
}

function inferStrategy(oracles: OracleUsage[]): string {
  const labels = oracles.filter((o) => o.label).map((o) => o.label!);
  if (labels.length > 0) {
    return `Follows the ${labels.join(" and ")} oracle${labels.length > 1 ? "s" : ""}.`;
  }
  return `Queries ${oracles.length} oracle${oracles.length > 1 ? "s" : ""}: ${oracles
    .map((o) => o.oracle)
    .join(", ")}.`;
}
