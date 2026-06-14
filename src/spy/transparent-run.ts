import { createWalletClient, createPublicClient, http, erc20Abi, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { resolveChain } from "../chain/chains.js";
import { decide } from "../agent/strategy.js";
import { ethPriceAt, btcSignalAt } from "../oracle/feed.js";
import { deriveSpyAddresses, type SpyAddresses } from "./agents.js";
import type { RunEvent } from "./run-events.js";

export interface TransparentRunOpts {
  mnemonic: string;
  token: string;
  tokenDecimals?: number;
  environment?: string;
  rpcUrl?: string;
  ticks?: number;
}

/** I/O seam: real chain transfers in prod, a fake in tests. */
export interface TransparentRunIO {
  agent: `0x${string}`;
  /** Fund the agent (gas + visible token edge); returns the token funding hash. */
  fund(): Promise<`0x${string}`>;
  /** Pay one oracle `amount` (base units); returns the transfer hash. */
  payOracle(to: `0x${string}`, amount: bigint): Promise<`0x${string}`>;
}

const FALLBACK_EXPLORER = "https://testnet.arcscan.app";

function clampTicks(ticks?: number): number {
  return Math.min(Math.max(ticks ?? 3, 1), 5);
}

function priceFor(decimals: number): bigint {
  return 10n ** BigInt(Math.max(decimals - 3, 0)); // 0.001 token
}

/** Build the real-chain IO (funder index 0, transparent agent index 6). */
function makeRealIo(opts: TransparentRunOpts, addrs: SpyAddresses): TransparentRunIO {
  const chain = resolveChain(opts.environment ?? "arc-testnet");
  const rpcUrl = opts.rpcUrl ?? chain.defaultRpc;
  const token = opts.token as `0x${string}`;
  const ticks = clampTicks(opts.ticks);
  const price = priceFor(opts.tokenDecimals ?? 6);

  const funder = mnemonicToAccount(opts.mnemonic);
  const agent = mnemonicToAccount(opts.mnemonic, { accountIndex: 6 });
  const pub = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
  const funderWallet = createWalletClient({ account: funder, chain: chain.viemChain, transport: http(rpcUrl) });
  const agentWallet = createWalletClient({ account: agent, chain: chain.viemChain, transport: http(rpcUrl) });

  return {
    agent: agent.address,
    async fund() {
      const gasHash = await funderWallet.sendTransaction({ to: agent.address, value: parseEther("0.02") });
      await pub.waitForTransactionReceipt({ hash: gasHash });
      const fundAmount = price * BigInt(ticks) * 2n + price;
      const fundHash = await funderWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [agent.address, fundAmount] });
      await pub.waitForTransactionReceipt({ hash: fundHash });
      return fundHash;
    },
    async payOracle(to, amount) {
      const h = await agentWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
      await pub.waitForTransactionReceipt({ hash: h });
      return h;
    },
  };
}

/**
 * Run the TRANSPARENT agent for real and stream one event per mined tx:
 * start → fund → (pay ETH, pay BTC, decide) per tick → done. Decision/price data
 * comes from the deterministic feed + strategy (no oracle HTTP); the payments are
 * real, visible on-chain transfers. Pass `io` to unit-test without a chain.
 */
export async function* runTransparentAgentStream(
  opts: TransparentRunOpts,
  io?: TransparentRunIO,
): AsyncGenerator<RunEvent> {
  const ticks = clampTicks(opts.ticks);
  const price = priceFor(opts.tokenDecimals ?? 6);
  const addrs = deriveSpyAddresses(opts.mnemonic);
  const runner = io ?? makeRealIo(opts, addrs);
  const explorerBase = resolveChain(opts.environment ?? "arc-testnet").viemChain.blockExplorers?.default?.url ?? FALLBACK_EXPLORER;

  yield { kind: "start", explorerBase };
  yield { kind: "fund", hash: await runner.fund() };

  let prevEth = 0;
  for (let t = 0; t < ticks; t++) {
    yield { kind: "pay", tick: t, oracle: "ETH", amount: price.toString(), hash: await runner.payOracle(addrs.ethOracle, price) };
    yield { kind: "pay", tick: t, oracle: "BTC", amount: price.toString(), hash: await runner.payOracle(addrs.btcOracle, price) };

    const ethPrice = ethPriceAt(t);
    const btcSignal = btcSignalAt(t);
    const ethPrevPrice = t === 0 ? ethPrice : prevEth;
    const action = decide({ ethPrice, ethPrevPrice, btcSignal });
    yield { kind: "decide", tick: t, action, ethPrice, btcSignal };
    prevEth = ethPrice;
  }

  yield { kind: "done", agent: runner.agent };
}

/** Drain the stream to the legacy summary shape (used by tests / non-stream callers). */
export async function runTransparentAgent(
  opts: TransparentRunOpts,
  io?: TransparentRunIO,
): Promise<{ agent: `0x${string}`; ticks: number }> {
  let agent = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  let ticks = 0;
  for await (const e of runTransparentAgentStream(opts, io)) {
    if (e.kind === "decide") ticks = e.tick + 1;
    if (e.kind === "done") agent = e.agent;
  }
  return { agent, ticks };
}
