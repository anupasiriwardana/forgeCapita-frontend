"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { chainName } from "@/config/chains";
import { type TakeoverCaseDto, type TakeoverExecutionDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/explorer";
import { getFeeOverrides } from "@/lib/fees";

type Addr = `0x${string}`;

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

function asAddr(v: unknown): Addr | null {
  return typeof v === "string" && ADDRESS_REGEX.test(v) ? (v as Addr) : null;
}

function TxLink({ chainId, hash }: { chainId: number; hash: string | null }) {
  const url = hash ? explorerTxUrl(chainId, hash) : null;
  if (!url) return <span>{hash ?? "-"}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>
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
        setResult({ ok: false, text: "Transaction failed (reverted).", hash });
      } else {
        setResult({ ok: true, text: "Nomination confirmed. The API sees the event after the indexer catches up (up to a minute).", hash });
        onSent();
      }
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const advisory = c.result === "failed" || c.result === "no_quorum";

  return (
    <div style={{ marginBottom: "16px" }}>
      <h4 style={{ fontSize: "14px", marginBottom: "6px" }}>On-chain execution</h4>
      <div style={{ fontSize: "13px" }}>
        <StatusLine chainId={chainId} execution={execution} />
      </div>
      <p style={MUTED}>The vote is advisory; result: {c.result ?? "-"}</p>
      {advisory && (
        <div className="alert alert-warning" style={{ margin: "8px 0" }}>
          The vote did not pass. Proposing a new developer anyway is allowed but goes against the community result.
        </div>
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={busy || blocker !== null}
        onClick={() => setConfirm(true)}
      >
        {busy ? "Waiting for confirmation..." : "Propose new developer"}
      </button>
      {blocker && <p style={{ ...MUTED, margin: "6px 0 0" }}>{blocker}</p>}
      {result && (
        <div role={result.ok ? "status" : "alert"} className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: "10px" }}>
          <span>
            {result.text}
            {result.hash && (
              <>
                {" "}
                <TxLink chainId={chainId} hash={result.hash} />
              </>
            )}
          </span>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Propose a new developer?"
        confirmLabel="Send transaction"
        tone="danger"
        busy={busy}
        onConfirm={() => void propose()}
        onCancel={() => setConfirm(false)}
      >
        This sends an on-chain transaction from the guardian wallet that nominates {c.candidateWallet} as the new
        developer. Nothing changes until the candidate accepts; you can replace the nomination by proposing again. After
        acceptance the old developer loses developer rights on this project and the escrow pays future milestones to the
        new developer. This cannot be undone except by another proposal and acceptance.
      </ConfirmDialog>
    </div>
  );
}
