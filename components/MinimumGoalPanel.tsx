"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { chainCurrency } from "@/config/chains";
import { formatEth, type MinimumGoalDto } from "@/lib/api";

interface Props {
  chainId: number;
  goal: MinimumGoalDto | undefined;
  /** Entered goal in wei, or null when it does not parse. */
  enteredWei: bigint | null;
}

const noteStyle = { fontSize: "13px", marginTop: "10px", opacity: 0.85 } as const;
const warnStyle = { fontSize: "13px", marginTop: "10px", color: "#f59e0b" } as const;

/** Parse a decimal wei string; null when invalid. */
export function parseWei(value: string | null | undefined): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** The live minimum as bigint, or null in test mode / when unavailable. */
export function liveMinimumWei(goal: MinimumGoalDto | undefined): bigint | null {
  return goal && goal.mode === "live" ? parseWei(goal.minGoalWei) : null;
}

export function MinimumGoalPanel({ chainId, goal, enteredWei }: Props) {
  const [open, setOpen] = useState(false);
  const currency = chainCurrency(chainId);

  // No data: mode is unknown (still loading, or the very first request failed), so show nothing.
  if (!goal) return null;
  if (goal.mode === "test") {
    return <p style={noteStyle}>Minimum funding goal is disabled in test mode.</p>;
  }

  const minWei = parseWei(goal.minGoalWei);
  if (minWei === null) {
    return <p style={noteStyle}>Could not load the minimum; the server will still check.</p>;
  }
  const below = enteredWei !== null && enteredWei < minWei;
  const minText = `${formatEth(goal.minGoalWei, 6)} ${currency}`;
  const gasPrice = parseWei(goal.gasPriceUsed);
  const margin = parseWei(goal.margin);

  return (
    <div style={{ marginTop: "12px" }}>
      <p style={{ fontSize: "14px", fontWeight: 600 }}>Minimum funding goal: {minText}</p>
      {goal.stale && (
        <p style={warnStyle}>
          The live gas estimate is unavailable, so this minimum may be a fallback value and can change.
        </p>
      )}
      {below && <p style={warnStyle}>Your funding goal is below the minimum of {minText}. Raise it to continue.</p>}
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: "6px 12px", fontSize: "12px", marginTop: "8px" }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        How is this calculated?
      </button>
      {open && (
        <div style={noteStyle}>
          <p>
            The 5% platform fee must cover the gas we sponsor for about {goal.N} investors and {goal.M} milestones,
            plus a safety margin.
          </p>
          <ul style={{ marginTop: "8px", paddingLeft: "18px" }}>
            <li>Gas units: {goal.gasUnits}</li>
            <li>Smoothed gas price: {gasPrice === null ? "-" : `${formatUnits(gasPrice, 9)} gwei`}</li>
            <li>L1 fee: {formatEth(goal.l1FeeUsed, 6)} {currency}</li>
            <li>Investors (N): {goal.N}</li>
            <li>Milestones (M): {goal.M}</li>
            <li>Safety margin: {margin === null ? "-" : formatUnits(margin, 2)}%</li>
            <li>Averaging window: {goal.windowHours} hours</li>
            <li>Computed at: {new Date(goal.computedAt).toLocaleString()}</li>
            <li>Floor: {formatEth(goal.floor, 6)} {currency}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
