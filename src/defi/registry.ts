import type { PrimitiveAdapter, PrimitiveKind } from "./types.js";
import { swapAdapter, type SwapCfg } from "./primitives/swap.js";
import { vault4626Adapter, type Vault4626Cfg } from "./primitives/vault4626.js";
import { aaveSupplyAdapter, type AaveSupplyCfg } from "./primitives/aaveSupply.js";

export const ADAPTERS: Record<PrimitiveKind, PrimitiveAdapter<any>> = {
  swap: swapAdapter,
  vault4626: vault4626Adapter,
  aaveSupply: aaveSupplyAdapter,
};

export type RegistryEntry =
  | { kind: "swap"; cfg: SwapCfg }
  | { kind: "vault4626"; cfg: Vault4626Cfg }
  | { kind: "aaveSupply"; cfg: AaveSupplyCfg };

/**
 * Human id -> primitive instance. Gives the UI/demo a "per protocol" feel while a
 * single adapter per primitive sits underneath. Addresses are env/testnet-specific
 * and registered at setup time (see scripts/defi-e2e.ts), not hard-coded here.
 */
export const registry: Record<string, RegistryEntry> = {};

/** Register (or overwrite) a registry entry. Used by setup scripts. */
export function register(id: string, entry: RegistryEntry): void {
  registry[id] = entry;
}

export function resolve(registryId: string): {
  entry: RegistryEntry;
  adapter: PrimitiveAdapter<any>;
} {
  const entry = registry[registryId];
  if (!entry) throw new Error(`unknown defi registry id: ${registryId}`);
  return { entry, adapter: ADAPTERS[entry.kind] };
}
