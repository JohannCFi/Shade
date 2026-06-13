/**
 * Probe the Unlink environment with just the admin API key.
 * Validates the key and tries to surface configured contract/token addresses.
 *
 * Reads env directly (does not import the strict config, which also requires
 * the token + mnemonic we don't have yet).
 *
 * Run: npx tsx scripts/inspect-unlink-env.ts
 */
import "dotenv/config";
import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";

async function main() {
  const apiKey = process.env.UNLINK_API_KEY?.trim();
  const environment = process.env.UNLINK_ENVIRONMENT?.trim() || "base-sepolia";
  if (!apiKey) throw new Error("UNLINK_API_KEY missing in .env");

  const admin = createUnlinkAdmin({ environment, apiKey, dangerouslyAllowBrowser: false });

  console.log(`Probing environment "${environment}" with provided API key…\n`);
  const info = await admin.environment();
  console.log(JSON.stringify(info, null, 2));
}

main().catch((err) => {
  console.error("Failed to read environment info:");
  console.error(err);
  process.exit(1);
});
