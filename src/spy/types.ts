/**
 * Spy indexer types — what a competitor reading the chain can reconstruct about
 * an agent. The transparent rail yields a full SpyReport; the Unlink rail yields
 * an empty/unreadable one. The contrast is the whole pitch.
 */

/** A single payment a chain observer can see (normalized from on-chain logs). */
export interface ObservablePayment {
  from: string;
  to: string;
  /** Amount in the asset's smallest unit (decimal string). */
  amount: string;
  asset?: string;
  /** Unix seconds, if known. */
  timestamp?: number;
  txHash?: string;
}

/** How often / how much the agent paid one oracle. */
export interface OracleUsage {
  oracle: string;
  /** Human label if the oracle is known (e.g. "ETH price"). */
  label?: string;
  calls: number;
  /** Total paid to this oracle, smallest unit (decimal string). */
  totalSpent: string;
}

/** A DeFi venue the agent moved capital into (reconstructed from the transparent rail). */
export interface VenueAllocation {
  venue: string;
  /** Human label if known (e.g. "Yield vault"). */
  label?: string;
  /** Total capital sent to this venue, smallest unit (decimal string). */
  amount: string;
}

/** What the spy reconstructed for one rail. */
export interface SpyReport {
  /** True if the observer could reconstruct anything at all. */
  readable: boolean;
  /** The agent's payer address (the cluster), or null if unreadable. */
  payer: string | null;
  /** Who funded the agent, or null if hidden. */
  funder: string | null;
  /** Oracles the agent queries, most-used first. */
  oracles: OracleUsage[];
  /** DeFi venues the agent allocated capital into (the leaked execution). */
  allocations: VenueAllocation[];
  /** Total the agent spent, smallest unit (decimal string). */
  totalSpent: string;
  /** One-line reconstructed strategy, or null if unreadable. */
  inferredStrategy: string | null;
}
