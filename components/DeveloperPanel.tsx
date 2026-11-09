"use client";

import { useState } from "react";
import { useAccount, useBalance, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/components/web3/AuthProvider";

type Addr = `0x${string}`;

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

/**
 * Developer-only "Close funding & start". Mirrors MilestoneEscrow.closeFundingAndStart():
 * msg.sender == developer, isFundingActive, now <= fundingDeadline + CLOSE_GRACE,
 * escrow balance >= fundingGoal. Conditions are read from the chain at render time.
 */
export function DeveloperPanel({ project, nowSeconds }: { project: ProjectDto; nowSeconds: number }) {
  const { address, isConnected } = useAccount();
  const { user } = useAuth();
  const walletChainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const feeClient = usePublicClient({ chainId: project.chainId });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const escrow = project.escrowAddress as Addr;
  const developer = project.developer.toLowerCase();
  const isDeveloper = developer === address?.toLowerCase() || developer === user?.address.toLowerCase();
  const walletIsDeveloper = developer === address?.toLowerCase();
  const wrongChain = walletChainId !== project.chainId;

  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "isFundingActive", chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "fundingGoal", chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "fundingDeadline", chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "CLOSE_GRACE", chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "PLATFORM_FEE_PERCENT", chainId: project.chainId },
    ],
    query: { enabled: isDeveloper },
  });
  const { data: balance } = useBalance({
    address: escrow,
    chainId: project.chainId,
    query: { enabled: isDeveloper, refetchInterval: 10_000 },
  });

  if (!isDeveloper) return null;

  const fundingActive = data?.[0]?.result;
  const goal = data?.[1]?.result;
  const deadline = data?.[2]?.result;
  const grace = data?.[3]?.result;
  const feePercent = data?.[4]?.result;
  const loaded =
    typeof fundingActive === "boolean" &&
    typeof goal === "bigint" &&
    typeof deadline === "bigint" &&
    typeof grace === "bigint" &&
    balance !== undefined;

  let reason: string | null = null;
  if (!loaded) reason = "Checking on-chain state...";
  else if (!fundingActive) reason = "Funding is already closed.";
  else if (BigInt(nowSeconds) > deadline + grace) reason = "The close window has ended; investors can refund instead.";
  else if (balance.value < goal) reason = "Funding goal not reached yet.";
  else if (!walletIsDeveloper) reason = "Connect the developer wallet to close funding.";
  else if (wrongChain) reason = `Switch your wallet to this project's network (chain ${project.chainId}).`;

  const feeText = typeof feePercent === "bigint" ? `${feePercent.toString()}%` : "a platform fee";

  async function handleClose(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const hash = await writeContractAsync({
        address: escrow,
        abi: ABIS.escrow,
        functionName: "closeFundingAndStart",
        chainId: project.chainId,
        ...(await getFeeOverrides(feeClient)),
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: project.chainId });
      if (receipt.status !== "success") {
        setResult({ ok: false, text: "Close funding failed (reverted)." });
        return;
      }
      setResult({
        ok: true,
        text: "Funding closed and project started. The indexer may take a little while to show the new state.",
      });
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      await queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "readContracts" || q.queryKey[0] === "balance" || (q.queryKey[0] === "project" && q.queryKey[1] === project.id),
      });
    }
  }

  return (
    <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>🛠️ Developer</h2>
      {reason ? (
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>{reason}</p>
      ) : (
        <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={busy || !isConnected} onClick={() => setConfirmOpen(true)}>
          {busy ? "Waiting for confirmation..." : "Close funding & start project"}
        </button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Close funding & start project?"
        confirmLabel="Close funding & start project"
        busy={busy}
        onConfirm={() => void handleClose()}
        onCancel={() => setConfirmOpen(false)}
      >
        This ends the funding phase, sends {feeText} of the raised funds to the platform treasury as the platform fee, and unlocks token claims for investors. This cannot be undone.
      </ConfirmDialog>
      {result && (
        <div className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: "16px" }}>
          <span>{result.ok ? "✅" : "⚠️"}</span>
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}
