import { formatUnits } from "viem";

/** Token/vote amounts (18 decimals) trimmed to at most 4 fractional digits. */
export function formatVotes(wei: bigint): string {
  const [whole, frac = ""] = formatUnits(wei, 18).split(".");
  const trimmed = frac.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** Token amount in wei (18 decimals) as a grouped decimal string; "-" for invalid input. Bigint-safe. */
export function formatTokenAmount(wei: string | bigint, maxFractionDigits = 4): string {
  let value: bigint;
  try {
    value = BigInt(wei);
  } catch {
    return "-";
  }
  const [whole, frac = ""] = formatUnits(value, 18).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Votes as a percentage of the public supply with one decimal (BigInt math); "0.0" when supply is 0. */
export function pctOfSupply(votes: bigint, publicSupply: bigint): string {
  if (publicSupply <= BigInt(0)) return "0.0";
  const tenths = (votes * BigInt(1000)) / publicSupply;
  const whole = tenths / BigInt(10);
  return `${whole.toString()}.${(tenths % BigInt(10)).toString()}`;
}

/** Bar width in whole-percent-of-100 with two decimals, capped at 100. */
export function barWidthPct(votes: bigint, publicSupply: bigint): string {
  if (publicSupply <= BigInt(0)) return "0";
  const hundredths = (votes * BigInt(10000)) / publicSupply;
  const capped = hundredths > BigInt(10000) ? BigInt(10000) : hundredths;
  return (Number(capped) / 100).toString();
}
