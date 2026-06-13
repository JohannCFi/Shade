"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";

/** Arc Testnet as a custom EVM network for Dynamic. */
const arcTestnet = {
  blockExplorerUrls: ["https://explorer.testnet.arc.network"],
  chainId: 5042002,
  chainName: "Arc Testnet",
  iconUrls: [],
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  networkId: 5042002,
  rpcUrls: ["https://rpc.testnet.arc.network"],
  vanityName: "Arc Testnet",
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "",
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [arcTestnet] },
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
