"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { chainCurrency } from "@/config/chains";
import { formatEth, formatEthCeil, type MinimumGoalDto } from "@/lib/api";

interface Props {
  chainId: number;
  goal: MinimumGoalDto | undefined;
  /** Entered goal in wei, or null when it does not parse. */
  enteredWei: bigint | null;
}


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
    return <p className="min-goal panel-note">The minimum fund goal is switched off in test mode.</p>;
  }

  const minWei = parseWei(goal.minGoalWei);
  if (minWei === null) {
    return <p className="min-goal panel-note">Could not load the minimum; it will still be checked when you launch.</p>;
  }
  const below = enteredWei !== null && enteredWei < minWei;
  const minText = `${formatEthCeil(goal.minGoalWei, 6)} ${currency}`;
  const gasPrice = parseWei(goal.gasPriceUsed);
  const margin = parseWei(goal.margin);

  return (
    <div className="min-goal">
      <p className="min-goal-title">
        Minimum fund goal: <span className="num">{minText}</span>
      </p>
      {(goal.stale || below) && (
        <div className="stack-sm" style={{ marginTop: 10 }}>
          {goal.stale && (
            <InlineAlert tone="warning">We could not get the latest network costs, so this minimum may change.</InlineAlert>
          )}
          {below && <InlineAlert tone="warning">Your fund goal is below the minimum of {minText}. Raise it to continue.</InlineAlert>}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        style={{ marginTop: 8, marginLeft: -12 }}
        aria-expanded={open}
        rightIcon={<ChevronDown size={14} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />}
        onClick={() => setOpen((v) => !v)}
      >
        How is this calculated?
      </Button>
      {open && (
        <div className="min-goal-details">
          <p>
            The 5% platform fee has to cover the network costs we pay for about {goal.N} investors and {goal.M} milestones,
            plus a safety margin.
          </p>
          <p style={{ marginTop: "8px", fontWeight: 600, color: "var(--text)" }}>Network cost details</p>
          <ul className="num">
            <li>Gas units: {goal.gasUnits}</li>
            <li>Smoothed gas price: {gasPrice === null ? "-" : `${formatUnits(gasPrice, 9)} gwei`}</li>
            <li>L1 fee: {formatEth(goal.l1FeeUsed, 6)} {currency}</li>
            <li>Investors (N): {goal.N}</li>
            <li>Milestones (M): {goal.M}</li>
            <li>Safety margin: {margin === null ? "-" : formatUnits(margin, 2)}%</li>
            <li>Averaging window: {goal.windowHours} hours</li>
            <li>Computed at: {new Date(goal.computedAt).toLocaleString()}</li>
            <li>Floor: {formatEthCeil(goal.floor, 6)} {currency}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
