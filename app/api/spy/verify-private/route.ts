import { NextResponse } from "next/server";
import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { mnemonicToAccount } from "viem/accounts";
import { config } from "@/src/unlink/config";
import { UNLINK_APP_ID } from "@/src/unlink/app-id";
import { summarizePrivateActivity } from "@/src/spy/private-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Owner-only proof that the agent's PRIVATE payments really landed — verifiable
 * via the Unlink engine, invisible on the public explorer. Read-only.
 * GET /api/spy/verify-private
 */
export async function GET(): Promise<NextResponse> {
  try {
    const admin = createUnlinkAdmin({ environment: config.environment, apiKey: config.apiKey });
    const signer = mnemonicToAccount(config.mnemonic);
    const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: config.chain.chainId });
    const signature = await signer.signMessage({ message });
    const agent = unlinkAccount.fromEthereumSignature({ signature, appId: UNLINK_APP_ID, chainId: config.chain.chainId });
    const agentAddr = await agent.getAddress();

    const ethSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 }).getAddress();
    const btcSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 }).getAddress();

    const txs = await admin.users.getTransactions({ address: agentAddr, limit: 20 });
    const sellerBalance = async (addr: string) => {
      const b = await admin.users.getBalances({ address: addr, token: config.testToken });
      const x = b.balances.find((y) => y.token.toLowerCase() === config.testToken.toLowerCase());
      return x?.amount ?? "0";
    };

    const summary = summarizePrivateActivity({
      txCount: txs.transactions.length,
      sellers: [
        { label: "ETH price", amountBaseUnits: await sellerBalance(ethSeller) },
        { label: "BTC signal", amountBaseUnits: await sellerBalance(btcSeller) },
      ],
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    // Graceful: no creds / empty pool → the panel shows "engine unavailable", page stays alive.
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 200 });
  }
}
