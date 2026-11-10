"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { explorerTxUrl } from "@/lib/explorer";
import { chainCurrency, SUPPORTED_CHAINS } from "@/config/chains";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Addr = `0x${string}`;
type Action = "freeze" | "unfreeze" | "cancel" | "shutdown";

const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;
const MAX_TOTAL_FREEZE = BigInt(90 * 24 * 60 * 60);
const REASON_MAX = 200;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asBig(v: unknown): bigint | null {
  return typeof v === "bigint" ? v : null;
}

function asAddr(v: unknown): Addr | null {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v) ? (v as Addr) : null;
}

function fmtDate(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleString();
}

function validateReason(raw: string): string | null {
  const reason = raw.trim();
  if (reason.length === 0) return "A reason is required";
  if (reason.length > REASON_MAX) return `Reason must be at most ${REASON_MAX} characters`;
  if (CONTROL_CHARS.test(reason)) return "Reason must be plain text";
  return null;
}

/**
 * Guardian-only controls for MilestoneEscrow: freezeMilestones, unfreezeMilestones, cancelProject and
 * emergencyShutdown. The guardian is read from registry.guardian() on chain. Client-side preconditions
 * mirror the contract; the contract revert stays the final authority. Gas is paid by the guardian.
 */
export function GuardianPanel({ project, nowSeconds }: { project: ProjectDto; nowSeconds: number }) {
  const { address } = useAccount();
  const walletChainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const chainId = project.chainId;
  const feeClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  const escrow = project.escrowAddress as Addr;
  const chainSupported = SUPPORTED_CHAINS.some((c) => c.id === chainId);
  const currency = chainCurrency(chainId);
  const wrongChain = walletChainId !== chainId;
  const enabled = address !== undefined && chainSupported;

  const { data: escrowReads } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "registry", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "projectToken", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "isFrozen", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "frozenUntil", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "totalFrozen", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "projectCancelled", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "completed", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "isFundingActive", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "cancelledAt", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "REFUND_WINDOW", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "remainingPublicTokens", chainId },
    ],
    query: { enabled, refetchInterval: 10_000 },
  });

  const registry = asAddr(escrowReads?.[0]?.result);
  const token = asAddr(escrowReads?.[1]?.result);

  const { data: extReads } = useReadContracts({
    allowFailure: true,
    contracts:
      registry && token
        ? [
            { address: registry, abi: ABIS.registry, functionName: "guardian", chainId },
            { address: token, abi: ABIS.token, functionName: "isInvalidated", chainId },
          ]
        : [],
    query: { enabled: enabled && registry !== null && token !== null, refetchInterval: 10_000 },
  });

  const guardian = asAddr(extReads?.[0]?.result);
  if (!enabled || !address || !guardian || guardian.toLowerCase() !== address.toLowerCase()) return null;

  const frozen = asBool(escrowReads?.[2]?.result);
  const frozenUntil = asBig(escrowReads?.[3]?.result);
  const totalFrozen = asBig(escrowReads?.[4]?.result);
  const cancelled = asBool(escrowReads?.[5]?.result);
  const completed = asBool(escrowReads?.[6]?.result);
  const fundingActive = asBool(escrowReads?.[7]?.result);
  const cancelledAt = asBig(escrowReads?.[8]?.result);
  const refundWindow = asBig(escrowReads?.[9]?.result);
  const remaining = asBig(escrowReads?.[10]?.result);
  const invalidated = asBool(extReads?.[1]?.result);
  const now = BigInt(nowSeconds);

  if (
    frozen === null || frozenUntil === null || totalFrozen === null || cancelled === null || completed === null ||
    fundingActive === null || cancelledAt === null || refundWindow === null || remaining === null || invalidated === null
  ) {
    return null;
  }

  let state = "Active";
  if (invalidated) state = "Shut down (token invalidated)";
  else if (cancelled) state = "Cancelled";
  else if (completed) state = "Completed";
  else if (frozen) state = `Milestones frozen until ${fmtDate(frozenUntil)}`;

  const networkReason = wrongChain ? "Switch your wallet to this project's network" : null;
  const closedReason = fundingActive
    ? "Funding is still active"
    : cancelled
      ? "Project is already cancelled"
      : completed
        ? "Project is already completed"
        : null;

  let freezeReason: string | null = closedReason;
  if (!freezeReason && frozen) freezeReason = "Milestones are already frozen";
  else if (!freezeReason && totalFrozen >= MAX_TOTAL_FREEZE) freezeReason = "The 90-day cumulative freeze limit is used up";
  freezeReason = freezeReason ?? networkReason;

  const unfreezeReason = !frozen ? "Milestones are not frozen" : networkReason;
  const cancelReason = closedReason ?? networkReason;

  let shutdownReason: string | null = null;
  if (invalidated) shutdownReason = "Token is already invalidated";
  else if (cancelled) {
    if (remaining !== BigInt(0) && now < cancelledAt + refundWindow) {
      shutdownReason = `Available after the refund window ends (${fmtDate(cancelledAt + refundWindow)}) or once no public tokens remain`;
    }
  } else if (!completed) shutdownReason = "Requires the project to be cancelled or completed";
  shutdownReason = shutdownReason ?? networkReason;

  const reasonError = validateReason(reason);
  const refundDays = refundWindow / BigInt(24 * 60 * 60);

  async function run(action: Action): Promise<void> {
    if (wrongChain) return;
    setBusy(action);
    setResult(null);
    try {
      const fees = await getFeeOverrides(feeClient);
      const base = { address: escrow, abi: ABIS.escrow, chainId, ...fees } as const;
      let hash: Addr;
      if (action === "freeze") hash = await writeContractAsync({ ...base, functionName: "freezeMilestones" });
      else if (action === "unfreeze") hash = await writeContractAsync({ ...base, functionName: "unfreezeMilestones" });
      else if (action === "cancel") {
        if (validateReason(reason) !== null) return;
        hash = await writeContractAsync({ ...base, functionName: "cancelProject", args: [reason.trim()] });
      } else hash = await writeContractAsync({ ...base, functionName: "emergencyShutdown" });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      if (receipt.status !== "success") {
        setResult({ ok: false, text: "Transaction failed (reverted).", hash });
        return;
      }
      if (action === "cancel") setReason("");
      setResult({ ok: true, text: "Transaction confirmed.", hash });
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(null);
      setConfirm(null);
      await queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "readContracts" || (q.queryKey[0] === "project" && q.queryKey[1] === project.id),
      });
    }
  }

  const link = result?.hash ? explorerTxUrl(chainId, result.hash) : null;

  function actionButton(action: Action, label: string, reasonText: string | null, danger = false) {
    return (
      <div style={{ marginBottom: "12px" }}>
        <button
          type="button"
          className={danger ? "btn-danger" : "btn-secondary"}
          style={{ width: "100%" }}
          disabled={busy !== null || reasonText !== null}
          onClick={() => setConfirm(action)}
        >
          {busy === action ? "Waiting for confirmation..." : label}
        </button>
        {reasonText && <p style={{ ...MUTED, margin: "6px 0 0" }}>{reasonText}</p>}
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Guardian controls</h2>
      <p style={{ ...MUTED, marginBottom: "16px" }}>
        Current state: <strong>{state}</strong>. You pay the network gas for these transactions.
      </p>
      {wrongChain && (
        <div className="alert alert-warning" style={{ marginBottom: "16px" }}>
          <span>⚠️</span>
          <span>Switch your wallet to this project&apos;s network (chain {chainId}) to use guardian controls.</span>
        </div>
      )}

      {actionButton("freeze", "Freeze milestones", freezeReason)}
      {actionButton("unfreeze", "Unfreeze milestones", unfreezeReason)}

      <div style={{ marginBottom: "12px" }}>
        <label className="label">Cancellation reason</label>
        <input
          className="input-field"
          type="text"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this project being cancelled?"
          disabled={busy !== null}
          style={{ marginBottom: "8px" }}
        />
        {actionButton("cancel", "Cancel project", cancelReason ?? (reasonError ? `Cancellation: ${reasonError}` : null), true)}
      </div>

      {actionButton("shutdown", "Emergency shutdown", shutdownReason, true)}

      <ConfirmDialog
        open={confirm === "freeze"}
        title="Freeze milestones?"
        confirmLabel="Freeze milestones"
        busy={busy !== null}
        onConfirm={() => void run("freeze")}
        onCancel={() => setConfirm(null)}
      >
        Milestone execution is blocked for at most 45 days. Only executeMilestone is affected. The cumulative freeze
        limit is 90 days; {fmtDays(totalFrozen)} already used.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "unfreeze"}
        title="Unfreeze milestones?"
        confirmLabel="Unfreeze milestones"
        busy={busy !== null}
        onConfirm={() => void run("unfreeze")}
        onCancel={() => setConfirm(null)}
      >
        Milestone execution is allowed again immediately.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this project?"
        confirmLabel="Cancel project"
        tone="danger"
        busy={busy !== null}
        confirmDisabled={reasonError !== null}
        onConfirm={() => void run("cancel")}
        onCancel={() => setConfirm(null)}
      >
        This is irreversible. Refunds open for {refundDays.toString()} days (the refund window) and milestones can no
        longer be executed. Reason: <strong>{reason.trim()}</strong>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "shutdown"}
        title="Emergency shutdown?"
        confirmLabel="Shut down"
        tone="danger"
        busy={busy !== null}
        onConfirm={() => void run("shutdown")}
        onCancel={() => setConfirm(null)}
      >
        This is irreversible. Project tokens are wiped (invalidated) and any remaining {currency} in the escrow is sent
        to the treasury.
      </ConfirmDialog>

      {result && (
        <div className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: "16px" }}>
          <span>{result.ok ? "✅" : "⚠️"}</span>
          <span>
            {result.text}
            {link && (
              <>
                {" "}
                <a href={link} target="_blank" rel="noopener noreferrer">View transaction</a>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function fmtDays(seconds: bigint): string {
  return `${(seconds / BigInt(24 * 60 * 60)).toString()} day(s)`;
}
