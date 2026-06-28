const BPS_DENOM = 10_000n;

/** Reduce `amount` by `bps` basis points, flooring. Used to derive a conservative minOut. */
export function applySlippage(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`slippageBps out of range: ${bps}`);
  }
  return (amount * (BPS_DENOM - BigInt(bps))) / BPS_DENOM;
}
