/**
 * Pure helpers for the bot dashboard (no I/O, unit-tested).
 */

/**
 * Default amount to deposit into the private budget: ~the whole wallet balance,
 * minus a gas reserve (Arc gas is USDC; deposit/withdraw cost gas). Atomic units.
 */
export function computeDefaultFundAmount(
  walletBalanceAtomic: string | bigint,
  gasReserveAtomic: string | bigint,
): string {
  const balance = BigInt(walletBalanceAtomic);
  const reserve = BigInt(gasReserveAtomic);
  const usable = balance - reserve;
  return usable > 0n ? usable.toString() : "0";
}

/**
 * The copy-paste snippet to plug an EXTERNAL bot into Shade with the same wallet
 * (= same bot identity). A template — real keys come from the bot's own env.
 *
 * When `apiUrl` is provided, returns a REMOTE snippet (no admin key — the bot
 * authenticates with its own wallet key via the deployed backend routes).
 * Without `apiUrl`, returns the local/admin-mode snippet (unchanged behaviour).
 */
export function botConnectSnippet(opts: { environment: string; token: string; apiUrl?: string }): string {
  if (opts.apiUrl) {
    return `import { createShadeAgent } from "@shade/pay";

// Remote mode: your bot authenticates with its own wallet — NO admin key.
const shade = createShadeAgent({
  environment: "${opts.environment}",
  apiUrl: "${opts.apiUrl}",                  // your deployed Shade
  token: "${opts.token}",                    // USDC
  privateKey: process.env.BOT_WALLET_PRIVATE_KEY!, // THIS wallet's key (dedicated to the bot)
});

await shade.payPrivate(oracleAddress, "0.001"); // private, invisible on-chain`;
  }
  return `import { createShadeAgent } from "@shade/pay";

// Same wallet you connected here = the SAME private bot identity.
const shade = createShadeAgent({
  environment: "${opts.environment}",
  apiKey: process.env.SHADE_API_KEY!,        // your Shade/Unlink project key
  token: "${opts.token}",                    // USDC
  mnemonic: process.env.BOT_WALLET_MNEMONIC!, // THIS wallet's key (dedicated to the bot)
});

await shade.payPrivate(oracleAddress, "0.001"); // private, invisible on-chain`;
}
