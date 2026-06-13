import {
  account as unlinkAccount,
  createUnlinkClient,
  evm,
  type UnlinkClient,
  type UnlinkLocalAccount,
  type ViemWalletClientLike,
  type ViemPublicClientLike,
} from "@unlink-xyz/sdk/client";
import { createUnlinkAdmin, type UnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { createPublicClient, createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

/**
 * Builds a fully self-contained Unlink client for a single Node process.
 *
 * In production the admin (API key) lives on the backend and the per-user
 * client lives in the browser, talking to each other over HTTP routes. For a
 * trusted CLI spike we wire them together in-process: the client's
 * `register` and `authorizationToken.provider` hooks call the admin directly.
 */
export interface NodeUnlinkContext {
  admin: UnlinkAdmin;
  client: UnlinkClient;
  account: UnlinkLocalAccount;
  /** The EVM address that funds onchain ops (approval/deposit/withdraw target). */
  evmAddress: `0x${string}`;
}

export function createNodeUnlinkContext(accountIndex = 0): NodeUnlinkContext {
  // --- EVM wallet (funds gas + holds ERC-20 before deposit) ---
  const evmSigner = config.privateKey
    ? privateKeyToAccount(config.privateKey as `0x${string}`)
    : mnemonicToAccount(config.mnemonic, { accountIndex });

  const walletClient = createWalletClient({
    account: evmSigner,
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.rpcUrl),
  });
  // The SDK bundles its own viem types, so our viem's WalletClient/PublicClient
  // are structurally identical but nominally distinct. Cast to the SDK's
  // structural "*Like" interfaces — runtime-safe, type-only reconciliation.
  const evmProvider = evm.fromViem({
    walletClient: walletClient as unknown as ViemWalletClientLike,
    publicClient: publicClient as unknown as ViemPublicClientLike,
  });

  // --- Unlink shielded account (separate keypair, derived from the mnemonic) ---
  const account = unlinkAccount.fromMnemonic({
    mnemonic: config.mnemonic,
    accountIndex,
  });

  // --- Admin handle (server-only; allowed here, this is a trusted CLI) ---
  const admin = createUnlinkAdmin({
    environment: config.environment,
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: false,
  });

  // --- Per-user client, wired in-process to the admin ---
  const client = createUnlinkClient({
    environment: config.environment,
    account,
    evm: evmProvider,
    register: (payload) => admin.users.register(payload),
    authorizationToken: {
      provider: async (ctx) => {
        const token = await admin.authorizationTokens.issue({
          unlinkAddress: ctx.unlinkAddress,
        });
        return { token: token.token, expiresAt: token.expiresAt };
      },
    },
  });

  return {
    admin,
    client,
    account,
    evmAddress: evmSigner.address,
  };
}
