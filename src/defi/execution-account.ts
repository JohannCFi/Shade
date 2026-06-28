import { createExecutionAccountClient } from "@unlink-xyz/sdk/advanced";
import type { EnvironmentInfo } from "@unlink-xyz/sdk/advanced";

/** Subset of an ExecutionAccountReservation we need to derive the address. */
export interface ReservationIndices {
  tenant_index: number;
  chain_index: number;
  account_index: number;
  account_address?: string | null;
}

/**
 * Resolve the CREATE2-predicted ExecutionAccount address from a reservation's
 * indices. `reserve()` on the live backend returns only the indices (no
 * account_address) for a freshly reserved, undeployed account, so the client
 * must compute the Solady ERC-4337 address itself from the env's factory +
 * implementation and the seed-backed account.
 */
export async function resolveExecAccountAddress(params: {
  account: unknown; // seed-backed AccountProvider (fromMnemonic / fromEthereumSignature)
  chainId: number;
  envInfo: EnvironmentInfo;
  reservation: ReservationIndices;
}): Promise<`0x${string}`> {
  const ea = params.envInfo.execution_account;
  if (!ea?.factory_address || !ea?.account_implementation_address) {
    throw new Error(
      "environment has no ExecutionAccount factory/implementation (execute() not enabled here)",
    );
  }
  const eac = createExecutionAccountClient({
    account: params.account as never,
    chainId: params.chainId,
    factoryAddress: ea.factory_address,
    accountImplementationAddress: ea.account_implementation_address,
    tenantIdx: params.reservation.tenant_index,
    chainIdx: params.reservation.chain_index,
    accountIdx: params.reservation.account_index,
  });
  return eac.executionAccountAddress as `0x${string}`;
}

export type ExecAccountResolver = (reservation: ReservationIndices) => Promise<`0x${string}`>;

/**
 * Build a resolver closure for the runner: returns the reservation's
 * account_address when present, else derives it from indices (env info fetched
 * once and cached).
 */
export function makeExecAccountResolver(params: {
  client: { getEnvironmentInfo(): Promise<EnvironmentInfo> };
  account: unknown;
  chainId: number;
}): ExecAccountResolver {
  let envInfoP: Promise<EnvironmentInfo> | null = null;
  return async (reservation) => {
    if (reservation.account_address) return reservation.account_address as `0x${string}`;
    envInfoP ??= params.client.getEnvironmentInfo();
    const envInfo = await envInfoP;
    return resolveExecAccountAddress({
      account: params.account,
      chainId: params.chainId,
      envInfo,
      reservation,
    });
  };
}
