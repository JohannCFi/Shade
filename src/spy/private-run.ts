import {
  account as unlinkAccount,
  createUnlinkClient,
  evm,
  type ViemWalletClientLike,
  type ViemPublicClientLike,
} from "@unlink-xyz/sdk/client";
import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { resolveChain } from "../chain/chains.js";
import { createNodeUnlinkContext } from "../unlink/node-client.js";
import { UNLINK_APP_ID } from "../unlink/app-id.js";
import { fromBaseUnits } from "../unlink/units.js";

const FALLBACK_EXPLORER = "https://testnet.arcscan.app";

export interface PrivateRunOpts {
  mnemonic: string;
  apiKey: string;
  environment: string;
  token: string;
  rpcUrl?: string;
  ticks: number;
  tokenDecimals?: number;
}

export interface PrivateRunResult {
  payments: number;
  sellersReceived: { label: string; amount: string }[];
  /** Public on-chain withdrawals (the oracles cashing out the private value). */
  withdrawals: { label: string; hash: string }[];
  explorerBase: string;
}

/**
 * Run the agent's PRIVATE rail for real, this run only. Uses the persistent,
 * already-funded Unlink identity (the same signature-derived account the engine
 * proof reads), pays each oracle privately `ticks` times, and returns the DELTA
 * since the run started — so the demo's "verify on engine" shows just this run's
 * confirmed private payments, starting from zero. Best-effort: the caller should
 * treat a throw as "private proof unavailable" and keep the demo running.
 */
export async function runPrivatePayments(opts: PrivateRunOpts): Promise<PrivateRunResult> {
  const chain = resolveChain(opts.environment);
  const rpcUrl = opts.rpcUrl ?? chain.defaultRpc;
  const decimals = opts.tokenDecimals ?? 6;
  const price = (10n ** BigInt(Math.max(decimals - 3, 0))).toString(); // 0.001
  const token = opts.token;

  // Derive the persistent agent identity the same way the browser/engine do.
  const signer = mnemonicToAccount(opts.mnemonic);
  const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: chain.chainId });
  const signature = await signer.signMessage({ message });
  const agentAccount = unlinkAccount.fromEthereumSignature({ signature, appId: UNLINK_APP_ID, chainId: chain.chainId });

  const walletClient = createWalletClient({ account: signer, chain: chain.viemChain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
  const evmProvider = evm.fromViem({
    walletClient: walletClient as unknown as ViemWalletClientLike,
    publicClient: publicClient as unknown as ViemPublicClientLike,
  });

  const admin = createUnlinkAdmin({ environment: opts.environment, apiKey: opts.apiKey });
  const client = createUnlinkClient({
    environment: opts.environment,
    account: agentAccount,
    evm: evmProvider,
    register: (payload) => admin.users.register(payload),
    authorizationToken: {
      provider: async (ctx) => {
        const t = await admin.authorizationTokens.issue({ unlinkAddress: ctx.unlinkAddress });
        return { token: t.token, expiresAt: t.expiresAt };
      },
    },
  });

  const ethSeller = await unlinkAccount.fromMnemonic({ mnemonic: opts.mnemonic, accountIndex: 2 }).getAddress();
  const btcSeller = await unlinkAccount.fromMnemonic({ mnemonic: opts.mnemonic, accountIndex: 3 }).getAddress();

  const balanceOf = async (addr: string): Promise<bigint> => {
    const b = await admin.users.getBalances({ address: addr, token });
    const x = b.balances.find((y) => y.token.toLowerCase() === token.toLowerCase());
    return BigInt(x?.amount ?? "0");
  };

  // Keep the live demo reliable: if the agent's shielded pool can't cover this
  // run, top it up from the owner's EVM wallet (deposit ~20 runs of buffer).
  const agentAddr = await agentAccount.getAddress();
  const needed = BigInt(price) * BigInt(opts.ticks) * 2n;
  if ((await balanceOf(agentAddr)) < needed) {
    const topUp = (needed * 20n).toString();
    await (await client.depositWithApproval({ token, amount: topUp })).wait();
  }

  const beforeEth = await balanceOf(ethSeller);
  const beforeBtc = await balanceOf(btcSeller);

  let payments = 0;
  for (let t = 0; t < opts.ticks; t++) {
    for (const seller of [ethSeller, btcSeller]) {
      const tx = await client.transfer({ token, amount: price, recipientAddress: seller });
      const result = await tx.wait();
      if (result.status === "processed") payments++;
    }
  }

  const afterEth = await balanceOf(ethSeller);
  const afterBtc = await balanceOf(btcSeller);
  const ethDelta = afterEth - beforeEth;
  const btcDelta = afterBtc - beforeBtc;
  const explorerBase = chain.viemChain.blockExplorers?.default?.url ?? FALLBACK_EXPLORER;

  // Trustless proof: each oracle cashes its just-received private balance OUT to
  // its public address. Anyone can open the withdrawal tx on the explorer and see
  // real USDC left the pool — without ever learning who paid. Best-effort per
  // seller so a slow/failed withdrawal never sinks the run.
  const withdrawals: { label: string; hash: string }[] = [];
  for (const [label, accountIndex, amount] of [
    ["ETH price", 2, ethDelta],
    ["BTC signal", 3, btcDelta],
  ] as const) {
    if (amount <= 0n) continue;
    try {
      const seller = createNodeUnlinkContext(accountIndex);
      const w = await seller.client.withdraw({
        token,
        amount: amount.toString(),
        recipientEvmAddress: seller.evmAddress,
      });
      const r = await w.wait();
      if (r.txHash) withdrawals.push({ label, hash: r.txHash });
    } catch {
      // proof unavailable for this seller — leave it out, the rest stands
    }
  }

  return {
    payments,
    sellersReceived: [
      { label: "ETH price", amount: fromBaseUnits(ethDelta.toString(), decimals) },
      { label: "BTC signal", amount: fromBaseUnits(btcDelta.toString(), decimals) },
    ],
    withdrawals,
    explorerBase,
  };
}
