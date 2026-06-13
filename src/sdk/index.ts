import {
  account as unlinkAccount,
  createUnlinkClient,
  evm,
  type UnlinkClient,
  type ViemWalletClientLike,
  type ViemPublicClientLike,
} from "@unlink-xyz/sdk/client";
import { createUnlinkAdmin, type UnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { resolveChain } from "../chain/chains.js";

/**
 * @shade/pay — the "bring your own bot" SDK.
 *
 * Drop this into your own trading bot to make its data spending PRIVATE: fund a
 * budget once, then pay per call via Unlink. Your strategy stays yours; Shade is
 * just the private payment rail. Self-tenant: you configure it with your own
 * project key + your own account key, and it pays from YOUR budget.
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
  readonly client: UnlinkClient;
  readonly evmAddress: `0x${string}`;
  private readonly token: string;
  private readonly decimals: number;
  private registered = false;

  constructor(cfg: ShadeAgentConfig) {
    if (!cfg.mnemonic && !cfg.privateKey) {
      throw new Error("ShadeAgent: provide a mnemonic or a privateKey");
    }
    const chain = resolveChain(cfg.environment ?? "arc-testnet");
    this.token = cfg.token;
    this.decimals = cfg.tokenDecimals ?? 6;
    const rpcUrl = cfg.rpcUrl ?? chain.defaultRpc;

    const evmSigner = cfg.privateKey
      ? privateKeyToAccount(cfg.privateKey as `0x${string}`)
      : mnemonicToAccount(cfg.mnemonic!);
    this.evmAddress = evmSigner.address;

    const walletClient = createWalletClient({ account: evmSigner, chain: chain.viemChain, transport: http(rpcUrl) });
    const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
    const evmProvider = evm.fromViem({
      walletClient: walletClient as unknown as ViemWalletClientLike,
      publicClient: publicClient as unknown as ViemPublicClientLike,
    });

    const account = cfg.mnemonic
      ? unlinkAccount.fromMnemonic({ mnemonic: cfg.mnemonic })
      : unlinkAccount.fromSeed({ seed: hexToSeed(cfg.privateKey!) });

    this.admin = createUnlinkAdmin({ environment: cfg.environment ?? "arc-testnet", apiKey: cfg.apiKey });
    this.client = createUnlinkClient({
      environment: cfg.environment ?? "arc-testnet",
      account,
      evm: evmProvider,
      register: (payload) => this.admin.users.register(payload),
      authorizationToken: {
        provider: async (ctx) => {
          const tok = await this.admin.authorizationTokens.issue({ unlinkAddress: ctx.unlinkAddress });
          return { token: tok.token, expiresAt: tok.expiresAt };
        },
      },
    });
  }

  /** Register the agent's Unlink account (idempotent). */
  async ready(): Promise<this> {
    if (!this.registered) {
      await this.client.ensureRegistered();
      this.registered = true;
    }
    return this;
  }

  /** Your private Unlink (bech32m) address. */
  address(): Promise<string> {
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

/** Turn a 0x private key into a 64-byte seed for Unlink's fromSeed. */
function hexToSeed(privateKey: string): Uint8Array {
  const hex = privateKey.replace(/^0x/, "").padStart(64, "0").slice(0, 64);
  const half = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  const seed = new Uint8Array(64);
  seed.set(half, 0);
  seed.set(half, 32);
  return seed;
}
