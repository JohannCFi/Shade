import { config } from "../unlink/config.js";
import { register, type RegistryEntry } from "./registry.js";

/**
 * The DeFi venues the /spy demo agent allocates capital into. Each maps to one of
 * the three private-DeFi primitives. Addresses come from env (deployed by
 * scripts/deploy-mock-vault.ts + scripts/deploy-mocks.ts). On the transparent rail
 * the agent touches `venueAddress` in the clear (leaked); on the private rail the
 * same action goes through execute() and is invisible.
 */
export interface DemoVenue {
  id: string; // registry id
  kind: "swap" | "vault4626" | "aaveSupply";
  label: string; // human label shown in the spy panel
  /** On-chain address the agent's capital flows to (the leaked counterparty). */
  venueAddress: `0x${string}`;
  /** Full registry entry — used by the transparent on-chain trade + private execute(). */
  entry: RegistryEntry;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/** Build + register the configured demo venues; returns the ones available. */
export function registerDemoVenues(): DemoVenue[] {
  const venues: DemoVenue[] = [];
  const usdc = config.testToken as `0x${string}`;

  const vault = env("DEFI_VAULT_ADDRESS");
  if (vault) {
    const entry: RegistryEntry = {
      kind: "vault4626",
      cfg: { vault: vault as `0x${string}`, asset: usdc, requiresUngatedVault: true },
    };
    register("demo-vault", entry);
    venues.push({ id: "demo-vault", kind: "vault4626", label: "Yield vault", venueAddress: vault as `0x${string}`, entry });
  }

  const router = env("DEFI_SWAP_ROUTER");
  const quoter = env("DEFI_SWAP_QUOTER");
  const tokenOut = env("DEFI_SWAP_TOKENOUT");
  if (router && quoter && tokenOut) {
    const entry: RegistryEntry = {
      kind: "swap",
      cfg: {
        router: router as `0x${string}`,
        quoter: quoter as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        fee: Number(env("DEFI_SWAP_FEE") ?? 3000),
      },
    };
    register("demo-swap", entry);
    venues.push({ id: "demo-swap", kind: "swap", label: "DEX swap", venueAddress: router as `0x${string}`, entry });
  }

  const pool = env("DEFI_AAVE_POOL");
  const aToken = env("DEFI_AAVE_ATOKEN");
  if (pool && aToken) {
    const entry: RegistryEntry = {
      kind: "aaveSupply",
      cfg: { pool: pool as `0x${string}`, asset: usdc, aToken: aToken as `0x${string}` },
    };
    register("demo-aave", entry);
    venues.push({ id: "demo-aave", kind: "aaveSupply", label: "Lending supply", venueAddress: pool as `0x${string}`, entry });
  }

  return venues;
}

/** address(lowercased) → label, for the spy reconstruction to humanize venues. */
export function demoVenueLabels(venues: DemoVenue[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const v of venues) m[v.venueAddress.toLowerCase()] = v.label;
  return m;
}
