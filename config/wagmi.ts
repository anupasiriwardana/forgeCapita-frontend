import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrumSepolia, bscTestnet } from "wagmi/chains";
import { http } from "wagmi";
import { RPC_URLS, SUPPORTED_CHAINS } from "./chains";

// Optional: the injected wallet (MetaMask) works without a real id; WalletConnect/mobile
// wallets need one (USER-ACTION in WS-03.4). The placeholder is not a secret.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "ForgeCapita",
  projectId,
  chains: SUPPORTED_CHAINS,
  transports: {
    [arbitrumSepolia.id]: http(RPC_URLS[421614]),
    [bscTestnet.id]: http(RPC_URLS[97]),
  },
  ssr: true,
});
