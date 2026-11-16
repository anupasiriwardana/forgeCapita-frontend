"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { chainName } from "@/config/chains";
import { type MyTakeoverCaseDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/explorer";
import { getFeeOverrides } from "@/lib/fees";

type Addr = `0x${string}`;

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

/**
 * Candidate side of the on-chain developer change: acceptDeveloperRole() on the escrow, signed in the
 * browser by the nominated wallet. Rendered only while the API reports a pending nomination.
 */
export function AcceptDeveloperRole({ item, writeAllowed }: { item: MyTakeoverCaseDto; writeAllowed: boolean }) {
  const { address } = useAccount();
  const walletChainId = useChainId();
  const config = useConfig();
  const chainId = item.chainId;
  const feeClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  const escrowRaw = item.projectId.split(":")[1] ?? "";
  const escrow: Addr | null = ADDRESS_REGEX.test(escrowRaw) ? (escrowRaw as Addr) : null;

  if (done) {
    const url = result?.hash ? explorerTxUrl(chainId, result.hash) : null;
    return (
      <span style={{ color: "var(--text-secondary)" }}>
        You are now the developer. Repository handover is done by staff.{" "}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>
            View transaction
          </a>
        )}
      </span>
    );
  }
  if (item.execution.state !== "proposed" || !item.execution.pendingForCandidate) return null;

  let blocker: string | null = null;
  if (!writeAllowed) blocker = "Complete your profile to continue";
  else if (!address || address.toLowerCase() !== item.candidateWallet.toLowerCase()) blocker = "Connect the candidate wallet";
  else if (walletChainId !== chainId) blocker = `Switch your wallet to ${chainName(chainId)}`;
  else if (!escrow) blocker = "Invalid project address";

  async function accept(): Promise<void> {
    if (busy || !escrow || walletChainId !== chainId) return;
    setBusy(true);
    setResult(null);
    try {
      const fees = await getFeeOverrides(feeClient);
      const hash = await writeContractAsync({
        address: escrow,
        abi: ABIS.escrow,
        functionName: "acceptDeveloperRole",
        chainId,
        ...fees,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      if (receipt.status !== "success") {
        setResult({ ok: false, text: "Transaction failed (reverted).", hash });
      } else {
        setResult({ ok: true, text: "Confirmed", hash });
        setDone(true);
      }
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" disabled={busy || blocker !== null} onClick={() => setConfirm(true)}>
        {busy ? "Waiting…" : "Accept developer role"}
      </button>
      {blocker && <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{blocker}</span>}
      {result && !result.ok && (
        <div role="alert" className="alert alert-error" style={{ width: "100%" }}>
          {result.text}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Accept the developer role?"
        confirmLabel="Send transaction"
        busy={busy}
        onConfirm={() => void accept()}
        onCancel={() => setConfirm(false)}
      >
        You become the project&apos;s developer on-chain: you will receive milestone payouts and vesting tokens and be
        responsible for delivery.
      </ConfirmDialog>
    </>
  );
}
