import type { SupportedChainId } from "./chains";

// Source: forgecapita-contracts/docs/deployments-v2.md (public values, no secrets).
// Per-project clones are discovered through the indexer/API, not listed here.
export interface ChainAddresses {
  factory: `0x${string}`;
  p2pExchange: `0x${string}`;
  registry: `0x${string}`;
  startBlock: bigint;
}

const SHARED = {
  factory: "0x246Ffa3Bf583a15e92e17FAa32d3663C17204d52",
  p2pExchange: "0xd2540297eB8FC0985b5fa26cba2358db0a0AE914",
  registry: "0x2e6A22fd249930b9F2905D1bD66443CbE366AacB",
} as const;

// BigInt() rather than literals: tsconfig targets ES2017.
export const ADDRESSES: Record<SupportedChainId, ChainAddresses> = {
  421614: { ...SHARED, startBlock: BigInt("324727776") },
  97: { ...SHARED, startBlock: BigInt("140034644") },
};

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return chainId === 421614 || chainId === 97;
}

export function getAddresses(chainId: number): ChainAddresses | undefined {
  return isSupportedChainId(chainId) ? ADDRESSES[chainId] : undefined;
}
