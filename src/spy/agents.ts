import { mnemonicToAccount } from "viem/accounts";

/**
 * Deterministic demo addresses for the spy split-screen, derived from the
 * project mnemonic (server-side only).
 *  - transparent: the x402-nu agent (visible direct transfers) — index 6
 *  - unlink:      the private agent (pays via Unlink, no visible oracle edges) — index 0
 *  - ethOracle / btcOracle: the oracle EOAs the transparent agent pays — index 4 / 5
 */
export interface SpyAddresses {
  transparent: `0x${string}`;
  unlink: `0x${string}`;
  ethOracle: `0x${string}`;
  btcOracle: `0x${string}`;
}

export function deriveSpyAddresses(mnemonic: string): SpyAddresses {
  return {
    transparent: mnemonicToAccount(mnemonic, { accountIndex: 6 }).address,
    unlink: mnemonicToAccount(mnemonic).address,
    ethOracle: mnemonicToAccount(mnemonic, { accountIndex: 4 }).address,
    btcOracle: mnemonicToAccount(mnemonic, { accountIndex: 5 }).address,
  };
}

export function oracleLabels(a: SpyAddresses): Record<string, string> {
  return {
    [a.ethOracle.toLowerCase()]: "ETH price",
    [a.btcOracle.toLowerCase()]: "BTC signal",
  };
}
