import { formatUnits } from "viem";

/** Token/vote amounts (18 decimals) trimmed to at most 4 fractional digits. */
export function formatVotes(wei: bigint): string {
  const [whole, frac = ""] = formatUnits(wei, 18).split(".");
  const trimmed = frac.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}
