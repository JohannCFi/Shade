export class DefiExecuteError extends Error {
  readonly execAccount: `0x${string}`;
  readonly registryId: string;
  readonly cause: unknown;
  constructor(cause: unknown, ctx: { execAccount: `0x${string}`; registryId: string }) {
    super(
      `DeFi execute failed for ${ctx.registryId} (execAccount ${ctx.execAccount}): ${String(cause)}`,
    );
    this.name = "DefiExecuteError";
    this.cause = cause;
    this.execAccount = ctx.execAccount;
    this.registryId = ctx.registryId;
  }
}
