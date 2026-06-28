import type { PublicClient } from "viem";
import type { PreviewContext, PrimitiveAdapter } from "./types.js";
import { DefiExecuteError } from "./errors.js";
import { resolve, type RegistryEntry } from "./registry.js";

export interface RunOptions {
  token: `0x${string}`;
  amount: bigint;
  slippageBps?: number;
  allowZeroSlippage?: boolean;
}

export interface RunResult {
  result: unknown; // Unlink execute() result (status, executionId, ...)
  execAccount: `0x${string}`;
  minOut: bigint;
}

function randomU128Decimal(): string {
  // 16 random bytes -> decimal string. Permit2 unordered nonce for the deposit-back.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString();
}

/**
 * Run a private DeFi action: reserve a FRESH ExecutionAccount, preview the
 * conservative output, build the atomic batch, then execute with a fixed-amount
 * depositBack (amount = minOut). `resolved` is injectable for testing; it defaults
 * to the registry lookup.
 */
export async function runPrivateDefi(
  client: any, // UnlinkClient (seed-backed)
  publicClient: PublicClient,
  registryId: string,
  opts: RunOptions,
  resolved?: { entry: RegistryEntry; adapter: PrimitiveAdapter<any> },
): Promise<RunResult> {
  const slippageBps = opts.slippageBps ?? 50;
  if (slippageBps === 0 && !opts.allowZeroSlippage) {
    throw new Error("slippageBps=0 is not allowed outside demo mode (allowZeroSlippage)");
  }
  const { entry, adapter } = resolved ?? resolve(registryId);

  // 1. FRESH ExecutionAccount (privacy invariant). Returns snake_case fields;
  //    account_address is the CREATE2-predicted EA address but is nullable in the
  //    schema — guard it: we need it as the recipient in buildCalls.
  const exec = await client.executionAccounts.reserve({ policy: "fresh" });
  if (!exec.account_address) {
    throw new Error(`reserve() returned no account_address for index ${exec.account_index}`);
  }
  const execAccount = exec.account_address as `0x${string}`;
  const previewCtx: PreviewContext = {
    execAccount,
    token: opts.token,
    amount: opts.amount,
    slippageBps,
  };

  // 2. preview FIRST (resolves the circular ordering; no funds moved yet)
  const minOut = await adapter.previewMin(entry.cfg, previewCtx, publicClient);
  const ctx = { ...previewCtx, minOut };

  // 3. build the batch (uses ctx.minOut for amountOutMinimum)
  const calls = adapter.buildCalls(entry.cfg, ctx);

  // 4. execute by_index against the reserved account; depositBack the result token.
  //    executeBatch is atomic — any inner revert reverts the whole UserOp.
  try {
    const result = await client.execute({
      token: opts.token,
      amount: opts.amount.toString(),
      calls,
      depositBack: {
        token: adapter.resultToken(entry.cfg, ctx),
        amount: minOut.toString(),
        nonce: randomU128Decimal(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      },
      allocationPolicy: "by_index",
      accountIndex: exec.account_index,
    });
    return { result, execAccount, minOut };
  } catch (err) {
    throw new DefiExecuteError(err, { execAccount, registryId });
  }
}
