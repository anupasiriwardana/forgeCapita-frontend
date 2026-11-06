import type { Abi } from "viem";
import { getAddresses, type ChainAddresses } from "@/config/addresses";
import { ForgeCapitaFactoryAbi } from "@/config/abis/ForgeCapitaFactoryAbi";
import { MilestoneEscrowAbi } from "@/config/abis/MilestoneEscrowAbi";
import { ProjectTokenAbi } from "@/config/abis/ProjectTokenAbi";
import { DividendDistributorAbi } from "@/config/abis/DividendDistributorAbi";
import { RevenueRouterAbi } from "@/config/abis/RevenueRouterAbi";
import { P2PExchangeAbi } from "@/config/abis/P2PExchangeAbi";
import { ForgeCapitaRegistryAbi } from "@/config/abis/ForgeCapitaRegistryAbi";

// Per-project clones (escrow, token, distributor, router) are not in the address map:
// pages pass their own address together with the matching ABI.
export const ABIS = {
  factory: ForgeCapitaFactoryAbi,
  escrow: MilestoneEscrowAbi,
  token: ProjectTokenAbi,
  distributor: DividendDistributorAbi,
  router: RevenueRouterAbi,
  p2p: P2PExchangeAbi,
  registry: ForgeCapitaRegistryAbi,
} as const;

type SharedContract = "factory" | "p2pExchange" | "registry";

const SHARED_ABIS = {
  factory: ABIS.factory,
  p2pExchange: ABIS.p2p,
  registry: ABIS.registry,
} as const satisfies Record<SharedContract, Abi>;

type SharedKey = Extract<keyof ChainAddresses, SharedContract>;

export function getContractConfig<N extends SharedKey>(
  chainId: number,
  name: N,
): { address: `0x${string}`; abi: (typeof SHARED_ABIS)[N] } | undefined {
  const addresses = getAddresses(chainId);
  if (!addresses) return undefined;
  return { address: addresses[name], abi: SHARED_ABIS[name] };
}
