"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { chainName } from "@/config/chains";
import { type TakeoverCaseDto, type TakeoverExecutionDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/explorer";
import { getFeeOverrides } from "@/lib/fees";
import { toast } from "@/lib/toast";
import { isUserRejection, toastTxError, txErrorMessage } from "@/lib/walletErrors";

type Addr = `0x${string}`;

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function asAddr(v: unknown): Addr | null {
  return typeof v === "string" && ADDRESS_REGEX.test(v) ? (v as Addr) : null;
}

function TxLink({ chainId, hash }: { chainId: number; hash: string | null }) {
  const url = hash ? explorerTxUrl(chainId, hash) : null;
  if (!url) return <span>{hash ?? "-"}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link-accent">
      View transaction
    </a>
  );
}

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function StatusLine({ chainId, execution }: { chainId: number; execution: TakeoverExecutionDto }) {
  if (execution.state === "accepted") {
    return (
      <p>
        Accepted (<TxLink chainId={chainId} hash={execution.acceptedTxHash} />, {when(execution.acceptedAt)}). The candidate is the
        developer on chain.
      </p>
    );
  }
  if (execution.state === "proposed") {
    return (
      <p>
        Proposed (<TxLink chainId={chainId} hash={execution.proposedTxHash} />, {when(execution.proposedAt)}).{" "}
        {execution.pendingForCandidate ? "Waiting for the candidate to accept." : "A later nomination replaced this one."}
      </p>
    );
  }
  if (execution.state === "unknown") return <p>Unknown. {execution.canProposeReason ?? "The indexer could not be read."}</p>;
  return <p>Not proposed.</p>;
}

/**
 * Staff view of the on-chain developer change for a closed case, plus the guardian-only
 * proposeNewDeveloper transaction signed in the browser. The guardian is read from registry.guardian();
 * the contract stays the final authority.
 */
export function TakeoverExecution({ c, onSent }: { c: TakeoverCaseDto; onSent: () => void }) {
  const { address } = useAccount();
  const walletChainId = useChainId();
  const config = useConfig();
  const chainId = c.chainId;
  const feeClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  const escrow = asAddr(c.projectId.split(":")[1] ?? "");
  const candidate = asAddr(c.candidateWallet);
  const execution = c.execution;

  const { data: registryRead } = useReadContracts({
    allowFailure: true,
    contracts: escrow ? [{ address: escrow, abi: ABIS.escrow, functionName: "registry", chainId }] : [],
    query: { enabled: escrow !== null && address !== undefined },
  });
  const registry = asAddr(registryRead?.[0]?.result);
  const { data: guardianRead } = useReadContracts({
    allowFailure: true,
    contracts: registry ? [{ address: registry, abi: ABIS.registry, functionName: "guardian", chainId }] : [],
    query: { enabled: registry !== null },
  });
  const guardian = asAddr(guardianRead?.[0]?.result);

  if (c.status !== "closed" || !execution) return null;

  let blocker: string | null = execution.canPropose ? null : (execution.canProposeReason ?? "Not available");
  if (blocker === null) {
    if (!address) blocker = "Connect the guardian wallet";
    else if (!guardian) blocker = "Reading the guardian from the chain";
    else if (guardian.toLowerCase() !== address.toLowerCase()) blocker = "Connect the guardian wallet";
    else if (walletChainId !== chainId) blocker = `Switch your wallet to ${chainName(chainId)}`;
    else if (!escrow || !candidate) blocker = "Invalid addresses on this case";
  }

  async function propose(): Promise<void> {
    if (busy || !escrow || !candidate || walletChainId !== chainId) return;
    setBusy(true);
    setResult(null);
    try {
      const fees = await getFeeOverrides(feeClient);
      const hash = await writeContractAsync({
        address: escrow,
        abi: ABIS.escrow,
        functionName: "proposeNewDeveloper",
        args: [candidate],
        chainId,
        ...fees,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      if (receipt.status !== "success") {
        toast.error("Transaction failed (reverted).");
        setResult({ ok: false, text: "Transaction failed (reverted).", hash });
      } else {
        toast.success("Nomination confirmed");
        setResult({ ok: true, text: "Nomination confirmed. The API sees the event after the indexer catches up (up to a minute).", hash });
        onSent();
      }
    } catch (err) {
      toastTxError(err);
      if (!isUserRejection(err)) setResult({ ok: false, text: txErrorMessage(err) });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const advisory = c.result === "failed" || c.result === "no_quorum";

  return (
    <div className="admin-section">
      <h3 className="admin-section-title">On-chain execution</h3>
      <div style={{ fontSize: 13 }}>
        <StatusLine chainId={chainId} execution={execution} />
      </div>
      <p className="panel-note" style={{ marginTop: 4 }}>The vote is advisory; result: {c.result ?? "-"}</p>
      {advisory && (
        <InlineAlert tone="warning" className="admin-section-alert">
          The vote did not pass. Proposing a new developer anyway is allowed but goes against the community result.
        </InlineAlert>
      )}
      <div style={{ marginTop: 12 }}>
        <Button loading={busy} disabled={blocker !== null} onClick={() => setConfirm(true)}>
          {busy ? "Waiting for confirmation..." : "Propose new developer"}
        </Button>
      </div>
      {blocker && <p className="panel-note" style={{ marginTop: 6 }}>{blocker}</p>}
      {result && (
        <InlineAlert tone={result.ok ? "success" : "danger"} className="admin-section-alert">
          {result.text}
          {result.hash && (
            <>
              {" "}
              <TxLink chainId={chainId} hash={result.hash} />
            </>
          )}
        </InlineAlert>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
        title="Propose a new developer?"
        body={
          <>
            This sends an on-chain transaction from the guardian wallet that nominates{" "}
            <span className="mono">{c.candidateWallet}</span> as the new developer. Nothing changes until the candidate
            accepts; you can replace the nomination by proposing again. After acceptance the old developer loses developer
            rights on this project and the escrow pays future milestones to the new developer. This cannot be undone except
            by another proposal and acceptance.
          </>
        }
        confirmLabel="Send transaction"
        tone="danger"
        onConfirm={propose}
      />
    </div>
  );
}
