"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button, buttonClass } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { chainName } from "@/config/chains";
import { toast } from "@/lib/toast";
import { isUserRejection, toastTxError, txErrorMessage } from "@/lib/walletErrors";
import { type MyTakeoverCaseDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/explorer";
import { getFeeOverrides } from "@/lib/fees";

type Addr = `0x${string}`;

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

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
      <InlineAlert
        tone="success"
        className="btn-block"
        action={
          url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
              View transaction
            </a>
          ) : undefined
        }
      >
        You are now the developer. Repository handover is done by staff.
      </InlineAlert>
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
        toast.error("Transaction failed (reverted).");
      } else {
        setResult({ ok: true, text: "Confirmed", hash });
        setDone(true);
        toast.success("Developer role accepted");
      }
    } catch (err) {
      toastTxError(err);
      if (!isUserRejection(err)) setResult({ ok: false, text: txErrorMessage(err) });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <Button loading={busy} disabled={blocker !== null} onClick={() => setConfirm(true)}>
        {busy ? "Waiting…" : "Accept developer role"}
      </Button>
      {blocker && <span className="panel-note">{blocker}</span>}
      {result && !result.ok && (
        <InlineAlert tone="danger" className="btn-block">
          {result.text}
        </InlineAlert>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(false);
        }}
        title="Accept the developer role?"
        body="You become the project's developer on-chain: you will receive milestone payouts and vesting tokens and be responsible for delivery."
        confirmLabel="Send transaction"
        onConfirm={accept}
      />
    </>
  );
}
