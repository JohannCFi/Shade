import type { ObservablePayment, OracleUsage, SpyReport, VenueAllocation } from "./types.js";

export interface ReconstructInput {
  /** The agent address the spy is profiling. */
  agentAddress: string;
  /** All payments a chain observer can see touching the agent. */
  payments: ObservablePayment[];
  /** Optional address(lowercased)→label map to humanize known oracles. */
  knownOracles?: Record<string, string>;
  /** Optional address(lowercased)→label map of known DeFi venues (the leaked allocations). */
  knownVenues?: Record<string, string>;
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

  const venueSet = input.knownVenues ?? {};
  const byOracle = new Map<string, OracleUsage>();
  const byVenue = new Map<string, VenueAllocation>();
  let totalSpent = 0n;
  for (const p of outgoing) {
    const key = p.to.toLowerCase();
    if (key in venueSet) {
      // Capital deployed into a DeFi venue — the leaked execution.
      const alloc: VenueAllocation = byVenue.get(key) ?? { venue: p.to, label: venueSet[key], amount: "0" };
      alloc.amount = (BigInt(alloc.amount) + BigInt(p.amount)).toString();
      byVenue.set(key, alloc);
      totalSpent += BigInt(p.amount);
      continue;
    }
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
  const allocations = [...byVenue.values()];
  const readable = outgoing.length > 0;

  return {
    readable,
    payer: readable ? input.agentAddress : null,
    funder: incoming.length > 0 ? incoming[0].from : null,
    oracles,
    allocations,
    totalSpent: totalSpent.toString(),
    inferredStrategy: readable ? inferStrategy(oracles, allocations) : null,
  };
}

function inferStrategy(oracles: OracleUsage[], allocations: VenueAllocation[]): string {
  const parts: string[] = [];
  const oracleLabels = oracles.filter((o) => o.label).map((o) => o.label!);
  if (oracleLabels.length > 0) {
    parts.push(`Follows the ${oracleLabels.join(" and ")} oracle${oracleLabels.length > 1 ? "s" : ""}`);
  } else if (oracles.length > 0) {
    parts.push(`Queries ${oracles.length} oracle${oracles.length > 1 ? "s" : ""}`);
  }
  const venueLabels = allocations.map((a) => a.label ?? a.venue);
  if (venueLabels.length > 0) {
    parts.push(`deploys capital into ${venueLabels.join(", ")}`);
  }
  return parts.length > 0 ? `${parts.join("; ")}.` : "No readable activity.";
}
