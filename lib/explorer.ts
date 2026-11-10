import { EXPLORER_URLS } from "@/config/chains";

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function explorerTxUrl(chainId: number, hash: string): string | null {
  if (!TX_HASH_REGEX.test(hash)) return null;
  const base = (EXPLORER_URLS as Record<number, string | undefined>)[chainId];
  if (!base || !base.startsWith("https://")) return null;
  return `${base}/tx/${hash}`;
}
