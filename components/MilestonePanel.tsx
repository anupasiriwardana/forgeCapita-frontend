"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { toastTxError, txErrorMessage } from "@/lib/walletErrors";
import { useQueryClient } from "@tanstack/react-query";
import { formatNative, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { formatVotes, pctOfSupply } from "@/lib/format";
import { EXPLORER_URLS } from "@/config/chains";
import { useAuth } from "@/components/web3/AuthProvider";

type Addr = `0x${string}`;
type Action = "start" | "execute";

const SECONDS_PER_DAY = BigInt(86400);
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
// Longhand margins only: spreading this object and overriding marginTop/marginBottom must not mix
// with a `margin` shorthand (React warns and can leave stale styles on re-render).
const MUTED = {
  fontSize: "13px",
  color: "var(--text-muted)",
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
} as const;

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
 * executeMilestone() (acts on currentMilestoneIndex). The UI offers normal execution to the developer only;
 * finalising a failed vote is offered to any wallet. All state is read from the chain.
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
      <Card>
        <CardBody style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span className="panel-title" style={{ fontWeight: 600 }}>
            <Flag size={16} aria-hidden="true" />
            Current milestone
          </span>
          <StatusPill tone="success">All milestones completed</StatusPill>
        </CardBody>
      </Card>
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

  const showExecuteButton = failedVote || (isDeveloper && !(approved && frozen));
  const waitingForDeveloper = approved && !frozen && !isDeveloper;

  async function send(functionName: "startMilestone" | "executeMilestone"): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      if (walletChainId !== chainId) {
        toast.error("Switch your wallet to this project's network.");
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
        toast.error("Transaction reverted.");
        setResult({ ok: false, text: "Transaction reverted.", hash });
        return;
      }
      toast.success(functionName === "startMilestone" ? "Milestone vote started." : "Milestone transaction confirmed.", {
        description: "The indexer and milestones page may take a little while to catch up.",
      });
      setResult({
        ok: true,
        text: "Transaction confirmed. This panel is updated now; the indexer and milestones page may take a little while to catch up.",
        hash,
      });
    } catch (err) {
      toastTxError(err);
      setResult({ ok: false, text: txErrorMessage(err) });
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

  let statusTone: StatusTone = "neutral";
  if (cancelled || failedVote) statusTone = "danger";
  else if (approved) statusTone = frozen ? "warning" : "success";
  else if (votingOpen) statusTone = "warning";

  return (
    <Card>
      <CardHeader
        title={
          <span className="panel-title">
            <Flag size={16} aria-hidden="true" />
            {hasMilestone ? `Milestone ${number.toString()}` : "Current milestone"}
          </span>
        }
        actions={<StatusPill tone={statusTone}>{status}</StatusPill>}
      />
      <CardBody>
        {hasMilestone && (
          <>
            {description && <p className="desc-text" style={{ fontSize: 14, marginBottom: 12 }}>{description}</p>}
            <div className="kv-list">
              <div className="kv-row">
                <span>Unlocks</span>
                <span className="num">
                  {unlockPct.toString()}% of net funds (about {releaseText})
                </span>
              </div>
              {voteReady && (
                <>
                  <div className="kv-row">
                    <span>Yes</span>
                    <span className="num">{formatVotes(yes)} ({pctOfSupply(yes, publicSupply)}% of public supply)</span>
                  </div>
                  <div className="kv-row">
                    <span>No</span>
                    <span className="num">{formatVotes(no)} ({pctOfSupply(no, publicSupply)}% of public supply)</span>
                  </div>
                  <div className="kv-row">
                    <span>Fast track</span>
                    <span className="num">more than {formatVotes(publicSupply / BigInt(2))} Yes (50% of the public supply)</span>
                  </div>
                  <div className="kv-row">
                    <span>Quorum</span>
                    <span className="num">
                      {formatVotes((publicSupply * BigInt(20)) / BigInt(100))} total votes (20%), turnout {pctOfSupply(yes + no, publicSupply)}%
                    </span>
                  </div>
                  <div className="kv-row">
                    <span>Voting ends</span>
                    <span className="num">{formatDate(votingEnd)} ({daysLeft(votingEnd, nowBig)})</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {!votingOpen && (
          <div className={hasMilestone ? "panel-section stack-sm" : "stack-sm"}>
            {isDeveloper ? (
              <>
                <p style={MUTED}>You pay the network fee.</p>
                {startReason ? (
                  <p style={MUTED}>{startReason}</p>
                ) : (
                  <Button className="btn-block" loading={busy} disabled={!isConnected} onClick={() => setConfirm("start")}>
                    Start milestone vote
                  </Button>
                )}
              </>
            ) : (
              !cancelled && hasMilestone && <p style={MUTED}>The developer has not started this milestone&apos;s vote yet.</p>
            )}
          </div>
        )}

        {showExecute && (
          <div className="panel-section stack-sm">
            {showExecuteButton && <p style={MUTED}>You pay the network fee.</p>}
            {executeBlocked && <p style={MUTED}>{executeBlocked}</p>}
            {waitingForDeveloper && <p style={MUTED}>Approved: waiting for the developer to execute this milestone.</p>}
            {showExecuteButton && (
              <Button
                variant={failedVote ? "danger" : "primary"}
                className="btn-block"
                loading={busy}
                disabled={!isConnected || wrongChain || !voteReady || executeBlocked !== null}
                onClick={() => setConfirm("execute")}
              >
                {executeLabel}
              </Button>
            )}
            {showExecuteButton && isConnected && wrongChain && (
              <p style={MUTED}>Switch your wallet to this project&apos;s network.</p>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirm === "start"}
          onOpenChange={(open) => { if (!open) setConfirm(null); }}
          title="Start milestone vote?"
          body={
            <>
              This starts a 28-day voting period for milestone {number.toString()} (&quot;{description}&quot;). Investors vote with staked tokens; the developer cannot vote.
              It is approved immediately if more than 50% of the public supply votes yes, otherwise after 28 days if at least 20% voted and yes outnumbers no. This cannot be undone.
            </>
          }
          confirmLabel="Start milestone vote"
          tone="danger"
          onConfirm={() => send("startMilestone")}
        />
        <ConfirmDialog
          open={confirm === "execute"}
          onOpenChange={(open) => { if (!open) setConfirm(null); }}
          tone="danger"
          title={failedVote ? "Finalise failed vote?" : "Execute milestone?"}
          body={
            failedVote
              ? "The vote ended without approval. Executing now will CANCEL the project and open refunds for investors; the developer receives nothing for this milestone. This cannot be undone."
              : `This pays about ${releaseText} to the developer wallet (a small part may repay sponsored gas). If this is the final milestone it also unlocks the developer's token vesting. This cannot be undone.`
          }
          confirmLabel={executeLabel}
          onConfirm={() => send("executeMilestone")}
        />

        {txHref && txHash && (
          <p className="tx-status">
            Last transaction{result && !result.ok ? " (failed)" : ""}:{" "}
            <a href={txHref} target="_blank" rel="noopener noreferrer" className="mono">
              {txHash.slice(0, 10)}…{txHash.slice(-6)}
            </a>
          </p>
        )}
      </CardBody>
    </Card>
  );
}
