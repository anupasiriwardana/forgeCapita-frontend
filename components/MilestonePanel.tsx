"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { formatNative, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { formatVotes } from "@/lib/format";
import { EXPLORER_URLS } from "@/config/chains";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/components/web3/AuthProvider";

type Addr = `0x${string}`;
type Action = "start" | "execute";

const SECONDS_PER_DAY = BigInt(86400);
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const MUTED = { fontSize: "13px", color: "var(--text-muted)", margin: 0 } as const;

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

function formatDate(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleString();
}

function daysLeft(end: bigint, now: bigint): string {
  if (now >= end) return "voting period ended";
  const days = (end - now) / SECONDS_PER_DAY;
  return days === BigInt(0) ? "less than 1 day left" : `${days.toString()} days left`;
}

/**
 * Milestone actions. Mirrors MilestoneEscrow.startMilestone() (developer only) and
 * executeMilestone() (permissionless, acts on currentMilestoneIndex). All state is read from the chain.
 */
export function MilestonePanel({ project, nowSeconds }: { project: ProjectDto; nowSeconds: number }) {
  const { address, isConnected } = useAccount();
  const { user } = useAuth();
  const walletChainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const feeClient = usePublicClient({ chainId: project.chainId });
  const { writeContractAsync } = useWriteContract();
  const [now, setNow] = useState(nowSeconds);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(timer);
  }, []);

  const escrow = project.escrowAddress as Addr;
  const chainId = project.chainId;
  const developer = project.developer.toLowerCase();
  const walletIsDeveloper = developer === address?.toLowerCase();
  const isDeveloper = walletIsDeveloper || developer === user?.address.toLowerCase();
  const wrongChain = walletChainId !== chainId;

  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "isFundingActive", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "projectCancelled", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "completed", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "currentMilestoneIndex", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "publicSupply", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "netFunds", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "isFrozen", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "frozenUntil", chainId },
    ],
    query: { refetchInterval: 10_000 },
  });

  const fundingActive = data?.[0]?.result;
  const cancelled = data?.[1]?.result;
  const completed = data?.[2]?.result;
  const index = data?.[3]?.result;
  const publicSupply = data?.[4]?.result;
  const netFunds = data?.[5]?.result;
  const frozen = data?.[6]?.result;
  const frozenUntil = data?.[7]?.result;
  const indexKnown = typeof index === "bigint";

  const { data: msData, isFetched: msFetched } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: escrow,
        abi: ABIS.escrow,
        functionName: "milestones",
        args: [indexKnown ? index : BigInt(0)],
        chainId,
      },
    ],
    query: { enabled: indexKnown, refetchInterval: 10_000 },
  });
  const ms = msData?.[0]?.result;
  const votingOpen = ms?.[2] === true;

  const { data: endData } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: escrow,
        abi: ABIS.escrow,
        functionName: "votingEndTime",
        args: [indexKnown ? index : BigInt(0)],
        chainId,
      },
    ],
    query: { enabled: indexKnown && votingOpen, refetchInterval: 10_000 },
  });
  const votingEnd = endData?.[0]?.result;

  const loaded =
    typeof fundingActive === "boolean" &&
    typeof cancelled === "boolean" &&
    typeof completed === "boolean" &&
    typeof index === "bigint" &&
    typeof publicSupply === "bigint" &&
    typeof netFunds === "bigint" &&
    typeof frozen === "boolean" &&
    typeof frozenUntil === "bigint" &&
    msFetched;

  if (!loaded || fundingActive) return null;

  if (completed) {
    return (
      <div className="glass-card" style={{ padding: "20px 28px", marginBottom: "24px" }}>
        <p style={MUTED}>Milestones: Completed</p>
      </div>
    );
  }

  const nowBig = BigInt(now);
  const description = ms?.[0];
  const unlockPct = ms?.[1];
  const yes = ms?.[4];
  const no = ms?.[5];
  const hasMilestone = typeof description === "string" && typeof unlockPct === "bigint";
  const number = index + BigInt(1);
  const releaseText = formatNative(
    (hasMilestone ? (netFunds * unlockPct) / BigInt(100) : BigInt(0)).toString(),
    chainId,
  );

  const voteReady = votingOpen && typeof yes === "bigint" && typeof no === "bigint" && typeof votingEnd === "bigint";
  const fastTrack = voteReady && yes > publicSupply / BigInt(2);
  const ended = voteReady && nowBig >= votingEnd;
  const quorum = voteReady && ended && yes + no >= (publicSupply * BigInt(20)) / BigInt(100) && yes > no;
  const approved = fastTrack || quorum;
  const failedVote = voteReady && ended && !approved;

  let status: string;
  if (cancelled) status = "Cancelled";
  else if (!hasMilestone) status = "No further milestone";
  else if (!votingOpen) status = "Waiting to start";
  else if (approved) status = frozen ? "Frozen" : "Ready to execute";
  else if (failedVote) status = "Voting ended without approval (will cancel)";
  else status = "Voting open";

  let startReason: string | null = null;
  if (cancelled) startReason = "Project is cancelled.";
  else if (!hasMilestone) startReason = "All milestones are executed.";
  else if (!walletIsDeveloper) startReason = "Connect the developer wallet to start the vote.";
  else if (wrongChain) startReason = "Switch your wallet to this project's network.";

  const showExecute = votingOpen && !cancelled;
  const frozenText = frozenUntil > BigInt(0) ? formatDate(frozenUntil) : "later";

  let executeLabel = "Execute milestone";
  let executeBlocked: string | null = null;
  if (failedVote) executeLabel = "Finalise failed vote";
  else if (approved && frozen) executeBlocked = `Milestones are frozen by the guardian until ${frozenText}`;
  else if (!approved) {
    executeBlocked = `Voting is open until ${voteReady ? formatDate(votingEnd) : "the end of the voting period"}. Early execution is possible only if more than 50% of the public supply votes yes.`;
  }

  async function send(functionName: "startMilestone" | "executeMilestone"): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      if (walletChainId !== chainId) {
        setResult({ ok: false, text: "Switch your wallet to this project's network." });
        return;
      }
      const fees = await getFeeOverrides(feeClient);
      const hash =
        functionName === "startMilestone"
          ? await writeContractAsync({ address: escrow, abi: ABIS.escrow, functionName, args: [number - BigInt(1)], chainId, ...fees })
          : await writeContractAsync({ address: escrow, abi: ABIS.escrow, functionName, chainId, ...fees });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      if (receipt.status !== "success") {
        setResult({ ok: false, text: "Transaction reverted.", hash });
        return;
      }
      setResult({
        ok: true,
        text: "Transaction confirmed. This panel is updated now; the indexer and milestones page may take a few minutes to catch up.",
        hash,
      });
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(false);
      setConfirm(null);
      await queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "readContracts" ||
          q.queryKey[0] === "balance" ||
          ((q.queryKey[0] === "project" || q.queryKey[0] === "milestones") && q.queryKey[1] === project.id),
      });
    }
  }

  const explorer = (EXPLORER_URLS as Record<number, string | undefined>)[chainId];
  const txHash = result?.hash;
  const txHref = txHash && TX_HASH_REGEX.test(txHash) && explorer ? `${explorer}/tx/${txHash}` : null;

  return (
    <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Milestone {hasMilestone ? number.toString() : ""}</h2>
      <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>{status}</p>
      {hasMilestone && (
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
          <span>{description}</span>
          <span>Unlocks {unlockPct.toString()}% of net funds (about {releaseText})</span>
          {voteReady && (
            <>
              <span>Yes: {formatVotes(yes)} / No: {formatVotes(no)}</span>
              <span>Fast-track threshold: more than {formatVotes(publicSupply / BigInt(2))} yes votes</span>
              <span>Quorum: {formatVotes((publicSupply * BigInt(20)) / BigInt(100))} total votes</span>
              <span>Voting ends {formatDate(votingEnd)} ({daysLeft(votingEnd, nowBig)})</span>
            </>
          )}
        </div>
      )}

      {!votingOpen && (
        <div style={{ marginBottom: "16px" }}>
          {isDeveloper ? (
            <>
              <p style={{ ...MUTED, marginBottom: "8px" }}>You pay the network fee.</p>
              {startReason ? (
                <p style={MUTED}>{startReason}</p>
              ) : (
                <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={busy || !isConnected} onClick={() => setConfirm("start")}>
                  {busy ? "Waiting for confirmation..." : "Start milestone vote"}
                </button>
              )}
            </>
          ) : (
            !cancelled && hasMilestone && <p style={MUTED}>The developer has not started this milestone&apos;s vote yet.</p>
          )}
        </div>
      )}

      {showExecute && (
        <div>
          <p style={{ ...MUTED, marginBottom: "8px" }}>You pay the network fee.</p>
          {executeBlocked && <p style={{ ...MUTED, marginBottom: "8px" }}>{executeBlocked}</p>}
          <button
            type="button"
            className={failedVote ? "btn-danger" : "btn-primary"}
            style={{ width: "100%" }}
            disabled={busy || !isConnected || wrongChain || !voteReady || executeBlocked !== null}
            onClick={() => setConfirm("execute")}
          >
            {busy ? "Waiting for confirmation..." : executeLabel}
          </button>
          {isConnected && wrongChain && <p style={{ ...MUTED, marginTop: "8px" }}>Switch your wallet to this project&apos;s network.</p>}
        </div>
      )}

      <ConfirmDialog
        open={confirm === "start"}
        title="Start milestone vote?"
        confirmLabel="Start milestone vote"
        busy={busy}
        onConfirm={() => void send("startMilestone")}
        onCancel={() => setConfirm(null)}
      >
        This starts a 28-day voting period for milestone {number.toString()} (&quot;{description}&quot;). Investors vote with staked tokens; the developer cannot vote.
        It is approved immediately if more than 50% of the public supply votes yes, otherwise after 28 days if at least 20% voted and yes outnumbers no. This cannot be undone.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "execute"}
        tone={failedVote ? "danger" : "default"}
        title={failedVote ? "Finalise failed vote?" : "Execute milestone?"}
        confirmLabel={executeLabel}
        busy={busy}
        onConfirm={() => void send("executeMilestone")}
        onCancel={() => setConfirm(null)}
      >
        {failedVote
          ? "The vote ended without approval. Executing now will CANCEL the project and open refunds for investors; the developer receives nothing for this milestone. This cannot be undone."
          : `This pays about ${releaseText} to the developer wallet (a small part may repay sponsored gas). If this is the final milestone it also unlocks the developer's token vesting. This cannot be undone.`}
      </ConfirmDialog>

      {result && (
        <div className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: "16px" }}>
          <span>{result.ok ? "✅" : "⚠️"}</span>
          <span>
            {result.text}
            {txHref && txHash && (
              <>
                {" "}
                <a href={txHref} target="_blank" rel="noopener noreferrer">
                  {txHash.slice(0, 10)}…{txHash.slice(-6)}
                </a>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
