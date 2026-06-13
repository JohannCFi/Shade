import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns the oracle sellers' Unlink (bech32m) addresses so the browser agent
 * can pay them privately. Derives them from the project mnemonic (indices 2/3),
 * registers them with the engine (idempotent), and caches the result.
 */
let cache: { eth: string; btc: string } | null = null;

export async function GET(): Promise<NextResponse> {
  if (cache) return NextResponse.json(cache);

  const mnemonic = process.env.WALLET_MNEMONIC;
  const apiKey = process.env.UNLINK_API_KEY;
  const environment = process.env.UNLINK_ENVIRONMENT ?? "arc-testnet";
  if (!mnemonic || !apiKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const admin = createUnlinkAdmin({ environment, apiKey });
  const ethSeller = unlinkAccount.fromMnemonic({ mnemonic, accountIndex: 2 });
  const btcSeller = unlinkAccount.fromMnemonic({ mnemonic, accountIndex: 3 });

  const [eth, btc] = await Promise.all([ethSeller.getAddress(), btcSeller.getAddress()]);
  await Promise.all([
    admin.users.register(await ethSeller.getRegistrationPayload()),
    admin.users.register(await btcSeller.getRegistrationPayload()),
  ]);

  cache = { eth, btc };
  return NextResponse.json(cache);
}
