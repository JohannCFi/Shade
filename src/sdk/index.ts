import {
  account as unlinkAccount,
  createUnlinkClient,
  evm,
  type UnlinkClient,
  type ViemWalletClientLike,
  type ViemPublicClientLike,
} from "@unlink-xyz/sdk/client";
import { createUnlinkAdmin, type UnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { resolveChain } from "../chain/chains.js";
import { UNLINK_APP_ID } from "../unlink/app-id.js";

/**
 * @shade/pay — the "bring your own bot" SDK.
 *
 * Drop this into your own trading bot to make its data spending PRIVATE: fund a
 * budget once, then pay per call via Unlink. Your strategy stays yours; Shade is
 * just the private payment rail. Self-tenant: you configure it with your own
 * project key + your own account key, and it pays from YOUR budget.
 *
 * The bot's private identity is derived the SAME way the /app dashboard derives
 * it — from the wallet's signature of the canonical derive-seed message. So the
 * same wallet always maps to the same single bot, whether you deploy it in the
 * dashboard or run it here. Deploy + fund in /app, then run your bot with the
 * same wallet: it pays from that budget and shows up in the dashboard's Activity.
 *
 * @example
 * const shade = createShadeAgent({ apiKey, mnemonic, token });
 * await shade.fundBudget("5");                 // 5 USDC into your private budget
 * await shade.payPrivate(oracleUnlinkAddr, "0.001");
 * console.log(await shade.budget());           // remaining
 */
export interface ShadeAgentConfig {
  /** Unlink environment (default arc-testnet). */
  environment?: string;
  /** Unlink project/admin API key (your own / self-hosted). */
  apiKey: string;
  /** ERC-20 asset to spend (USDC). */
  token: string;
  /** Decimals of the asset (USDC = 6). */
  tokenDecimals?: number;
  /** BIP-39 mnemonic OR a private key — derives YOUR Unlink account + EVM wallet. */
  mnemonic?: string;
  privateKey?: string;
  /** RPC override (else chain default). */
  rpcUrl?: string;
}

function toBaseUnits(amount: string, decimals: number): string {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "") || "0";
}
function fromBaseUnits(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export class ShadeAgent {
  readonly admin: UnlinkAdmin;
  readonly evmAddress: `0x${string}`;
  private readonly environment: string;
  private readonly token: string;
  private readonly decimals: number;
  private readonly chainId: number;
  private readonly evmSigner: ReturnType<typeof privateKeyToAccount> | ReturnType<typeof mnemonicToAccount>;
  private readonly evmProvider: ReturnType<typeof evm.fromViem>;
  private _client: UnlinkClient | null = null;

  constructor(cfg: ShadeAgentConfig) {
    if (!cfg.mnemonic && !cfg.privateKey) {
      throw new Error("ShadeAgent: provide a mnemonic or a privateKey");
    }
    const chain = resolveChain(cfg.environment ?? "arc-testnet");
    this.environment = cfg.environment ?? "arc-testnet";
    this.token = cfg.token;
    this.decimals = cfg.tokenDecimals ?? 6;
    this.chainId = chain.chainId;
    const rpcUrl = cfg.rpcUrl ?? chain.defaultRpc;

    this.evmSigner = cfg.privateKey
      ? privateKeyToAccount(cfg.privateKey as `0x${string}`)
      : mnemonicToAccount(cfg.mnemonic!);
    this.evmAddress = this.evmSigner.address;

    const walletClient = createWalletClient({ account: this.evmSigner, chain: chain.viemChain, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
    this.evmProvider = evm.fromViem({
      walletClient: walletClient as unknown as ViemWalletClientLike,
      publicClient: publicClient as unknown as ViemPublicClientLike,
    });
    this.admin = createUnlinkAdmin({ environment: this.environment, apiKey: cfg.apiKey });
  }

  /**
   * Build the Unlink client lazily on first use: the wallet signs the canonical
   * derive-seed message and the account comes from that signature — identical to
   * `createBrowserUnlinkClient` in the dashboard, so the identities match.
   */
  private async buildClient(): Promise<UnlinkClient> {
    const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: this.chainId });
    const signature = await this.evmSigner.signMessage({ message });
    const account = unlinkAccount.fromEthereumSignature({ signature, appId: UNLINK_APP_ID, chainId: this.chainId });
    return createUnlinkClient({
      environment: this.environment,
      account,
      evm: this.evmProvider,
      register: (payload) => this.admin.users.register(payload),
      authorizationToken: {
        provider: async (ctx) => {
          const tok = await this.admin.authorizationTokens.issue({ unlinkAddress: ctx.unlinkAddress });
          return { token: tok.token, expiresAt: tok.expiresAt };
        },
      },
    });
  }

  /** The underlying Unlink client. Call {@link ready} first. */
  get client(): UnlinkClient {
    if (!this._client) throw new Error("ShadeAgent: call ready() before using the client");
    return this._client;
  }

  /** Derive + register the agent's Unlink account (idempotent). */
  async ready(): Promise<this> {
    if (!this._client) {
      this._client = await this.buildClient();
      await this._client.ensureRegistered();
    }
    return this;
  }

  /** Your private Unlink (bech32m) address. */
  async address(): Promise<string> {
    await this.ready();
    return this.client.getAddress();
  }

  /** Deposit USDC into your private budget (human amount, e.g. "5"). */
  async fundBudget(amountHuman: string): Promise<void> {
    await this.ready();
    const tx = await this.client.depositWithApproval({ token: this.token, amount: toBaseUnits(amountHuman, this.decimals) });
    await tx.wait();
  }

  /** Remaining private budget, human-readable. */
  async budget(): Promise<string> {
    await this.ready();
    const { balances } = await this.client.getBalances({ token: this.token });
    const b = balances.find((x) => x.token.toLowerCase() === this.token.toLowerCase());
    return b ? fromBaseUnits(b.amount, this.decimals) : "0";
  }

  /** Pay an Unlink recipient PRIVATELY (human amount). No on-chain edge. */
  async payPrivate(recipientUnlinkAddress: string, amountHuman: string): Promise<void> {
    await this.ready();
    const tx = await this.client.transfer({
      token: this.token,
      amount: toBaseUnits(amountHuman, this.decimals),
      recipientAddress: recipientUnlinkAddress,
    });
    await tx.wait();
  }

  /** Withdraw remaining budget back to an EVM address. */
  async withdraw(recipientEvmAddress: string, amountHuman: string): Promise<void> {
    await this.ready();
    const tx = await this.client.withdraw({
      token: this.token,
      amount: toBaseUnits(amountHuman, this.decimals),
      recipientEvmAddress,
    });
    await tx.wait();
  }
}

export function createShadeAgent(cfg: ShadeAgentConfig): ShadeAgent {
  return new ShadeAgent(cfg);
}
