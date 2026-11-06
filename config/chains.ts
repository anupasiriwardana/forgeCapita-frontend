import { arbitrumSepolia, bscTestnet } from "wagmi/chains";

export const SUPPORTED_CHAINS = [arbitrumSepolia, bscTestnet] as const;

export type SupportedChainId = 421614 | 97;

// NEXT_PUBLIC_* values are bundled into the browser: never put secrets here.
// Dedicated keyed RPC URLs are introduced with WS-03.4. `||` treats an empty string as unset.
export const RPC_URLS: Record<SupportedChainId, string> = {
  421614:
    process.env.NEXT_PUBLIC_RPC_URL_421614 || "https://sepolia-rollup.arbitrum.io/rpc",
  97: process.env.NEXT_PUBLIC_RPC_URL_97 || "https://bsc-testnet-rpc.publicnode.com",
};

export const EXPLORER_URLS: Record<SupportedChainId, string> = {
  421614: "https://sepolia.arbiscan.io",
  97: "https://testnet.bscscan.com",
};
