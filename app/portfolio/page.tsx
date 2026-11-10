"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useConfig, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  fetchInvestorPositions,
  formatEth,
  listProjects,
  shortAddr,
  type InvestorPosition,
  type ProjectDto,
} from "@/lib/api";
import { phaseInputOf, refundsOpenFor } from "@/lib/projectState";
import { chainCurrency, chainName } from "@/config/chains";
import { ABIS } from "@/lib/contracts";
import { MyComplaints } from "@/components/MyComplaints";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { useAuth } from "@/components/web3/AuthProvider";
import { explorerTxUrl } from "@/lib/explorer";
import { failureOfRequest, listRelayRequests, type RelayRequest } from "@/lib/relay";

type Addr = `0x${string}`;

const ZERO = BigInt(0);
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const DASH = "—";

/** 18-decimals token amount, trimmed to at most 4 fractional digits. */
function formatToken(wei: string): string {
  const [whole = "0", frac = ""] = formatUnits(BigInt(wei), 18).split(".");
  const trimmed = frac.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function statusBadge(status: string): string {
  if (status === "CONFIRMED") return "badge-active";
  if (status === "FAILED" || status === "EXPIRED") return "badge-inactive";
  return "badge-pending";
}

function GaslessRequests() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<RelayRequest[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const signedIn = user !== null;

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    const { signal } = controller;
    listRelayRequests(20, signal)
      .then((list) => {
        if (!signal.aborted) setItems(list);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load gasless requests");
      });
    return () => controller.abort();
  }, [signedIn, reloadKey]);

  const retry = useCallback(() => {
    setError("");
    setItems(null);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <section style={{ marginTop: "40px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>Gasless requests</h2>

      {!signedIn && (
        <p style={{ color: "var(--text-muted)" }}>
          {authLoading ? "Checking sign-in…" : "Sign in to see your gasless requests"}
        </p>
      )}

      {signedIn && error && (
        <div className="alert alert-error" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span>⚠️ {error}</span>
          <button className="btn-secondary" onClick={retry}>Retry</button>
        </div>
      )}

      {signedIn && !error && items === null && (
        <p style={{ color: "var(--text-muted)" }}>Loading gasless requests…</p>
      )}

      {signedIn && !error && items !== null && items.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No gasless requests yet.</p>
      )}

      {signedIn && !error && items !== null && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((r) => {
            const failure = failureOfRequest(r);
            const txUrl = r.txHash ? explorerTxUrl(r.chainId, r.txHash) : null;
            const created = new Date(r.createdAt);
            return (
              <div key={r.id} className="glass-card" style={{ padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  <strong>{r.kind}</strong>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <span>{chainName(r.chainId)}</span>
                  <span>{Number.isNaN(created.getTime()) ? DASH : created.toLocaleString()}</span>
                  <Link href={`/projects/${encodeURIComponent(r.projectId)}`}>Project</Link>
                  {txUrl && (
                    <a href={txUrl} target="_blank" rel="noopener noreferrer">Transaction</a>
                  )}
                </div>
                {failure && (
                  <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--rose)" }}>{failure.message}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const [positions, setPositions] = useState<InvestorPosition[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [distributors, setDistributors] = useState<Record<string, Addr>>({});
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [projects, setProjects] = useState<Record<string, ProjectDto>>({});
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setError("");
    setPositions(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchInvestorPositions(address, { limit: 100 }, signal)
      .then((res) => {
        if (!signal.aborted) setPositions(res.positions);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load positions");
      });
    listProjects({ limit: 100 }, signal)
      .then((list) => {
        if (signal.aborted) return;
        const map: Record<string, string> = {};
        const dist: Record<string, Addr> = {};
        for (const p of list.items) {
          if (p.profile?.name) map[p.id] = p.profile.name;
          if (ADDRESS_REGEX.test(p.distributorAddress)) dist[p.id] = p.distributorAddress as Addr;
        }
        const byId: Record<string, ProjectDto> = {};
        for (const p of list.items) byId[p.id] = p;
        setNames(map);
        setDistributors(dist);
        setProjects(byId);
      })
      .catch(() => {
        /* names are optional: fall back to token symbol / address */
      });
    return () => controller.abort();
  }, [address, reloadKey]);

  const supportedChainIds = config.chains.map((c) => c.id as number);
  const yieldTargets = (positions ?? []).map((p) => {
    const distributor = distributors[p.projectId];
    return distributor && supportedChainIds.includes(p.chainId) ? { chainId: p.chainId, distributor } : null;
  });
  const yieldCalls = yieldTargets.flatMap((t) =>
    t && address
      ? [
          {
            address: t.distributor,
            abi: ABIS.distributor,
            functionName: "getClaimableYield" as const,
            args: [address] as const,
            chainId: t.chainId,
          },
        ]
      : [],
  );
  const { data: yieldData } = useReadContracts({
    allowFailure: true,
    contracts: yieldCalls,
    query: { enabled: isConnected && yieldCalls.length > 0 },
  });

  function claimableOf(index: number): bigint | null {
    if (!yieldTargets[index]) return null;
    let slot = 0;
    for (let i = 0; i < index; i++) if (yieldTargets[i]) slot++;
    const result = yieldData?.[slot];
    return result && result.status === "success" && typeof result.result === "bigint" ? result.result : null;
  }

  // Open-vote detection: only positions with staked tokens on supported chains are read.
  const voteTargets = (positions ?? []).map((p) =>
    address && supportedChainIds.includes(p.chainId) && ADDRESS_REGEX.test(p.escrowAddress) && BigInt(p.stakedBalance) > ZERO
      ? { chainId: p.chainId, escrow: p.escrowAddress as Addr }
      : null,
  );
  const indexCalls = voteTargets.flatMap((t) =>
    t
      ? [{ address: t.escrow, abi: ABIS.escrow, functionName: "currentMilestoneIndex" as const, chainId: t.chainId }]
      : [],
  );
  const { data: indexData } = useReadContracts({
    allowFailure: true,
    contracts: indexCalls,
    query: { enabled: isConnected && indexCalls.length > 0 },
  });

  function milestoneIndexOf(index: number): bigint | null {
    if (!voteTargets[index]) return null;
    let slot = 0;
    for (let i = 0; i < index; i++) if (voteTargets[i]) slot++;
    const result = indexData?.[slot];
    return result && result.status === "success" && typeof result.result === "bigint" ? result.result : null;
  }

  const voteReadPositions = voteTargets.flatMap((t, i) => {
    const milestoneIndex = milestoneIndexOf(i);
    return t && address && milestoneIndex !== null ? [{ position: i, target: t, milestoneIndex }] : [];
  });
  const voteCalls = voteReadPositions.flatMap(({ target, milestoneIndex }) => [
    { address: target.escrow, abi: ABIS.escrow, functionName: "milestones" as const, args: [milestoneIndex] as const, chainId: target.chainId },
    { address: target.escrow, abi: ABIS.escrow, functionName: "votingEndTime" as const, args: [milestoneIndex] as const, chainId: target.chainId },
    { address: target.escrow, abi: ABIS.escrow, functionName: "hasVoted" as const, args: [milestoneIndex, address as Addr] as const, chainId: target.chainId },
  ]);
  const { data: voteData } = useReadContracts({
    allowFailure: true,
    contracts: voteCalls,
    query: { enabled: isConnected && voteCalls.length > 0 },
  });

  /** Voting deadline (unix seconds) when the wallet has an unvoted open poll on this position, else null. */
  function openVoteEndOf(index: number): bigint | null {
    const slot = voteReadPositions.findIndex((r) => r.position === index);
    if (slot < 0 || !voteData) return null;
    const milestone = voteData[slot * 3];
    const end = voteData[slot * 3 + 1];
    const voted = voteData[slot * 3 + 2];
    if (!milestone || milestone.status !== "success" || !Array.isArray(milestone.result)) return null;
    if (!end || end.status !== "success" || typeof end.result !== "bigint") return null;
    if (!voted || voted.status !== "success" || voted.result !== false) return null;
    const [, , isVotingOpen, isExecuted] = milestone.result as readonly unknown[];
    if (isVotingOpen !== true || isExecuted !== false) return null;
    return end.result > BigInt(nowSeconds) ? end.result : null;
  }

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Portfolio</h1>

      {isConnected &&
        Array.from(new Set((positions ?? []).map((p) => p.chainId))).map((id) => (
          <IndexerLagNote key={id} chainId={id} />
        ))}

      {!isConnected && (
        <div className="alert alert-warning">
          <span>🔌</span> Connect your wallet to see your positions.
        </div>
      )}

      {isConnected && error && (
        <div className="alert alert-error" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span>⚠️ {error}</span>
          <button className="btn-secondary" onClick={retry}>Retry</button>
        </div>
      )}

      {isConnected && !error && positions === null && (
        <p style={{ color: "var(--text-muted)" }}>Loading positions…</p>
      )}

      {isConnected && !error && positions !== null && positions.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          No positions yet. <Link href="/">Browse projects</Link>
        </p>
      )}

      {isConnected && !error && positions !== null && positions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {positions.map((p, index) => {
            const net = BigInt(p.invested) - BigInt(p.refunded);
            const name = names[p.projectId] || p.tokenSymbol || shortAddr(p.escrowAddress);
            const claimable = claimableOf(index);
            const href = `/projects/${encodeURIComponent(p.projectId)}`;
            const project = projects[p.projectId];
            const refundAvailable =
              net > ZERO &&
              project !== undefined &&
              refundsOpenFor(BigInt(nowSeconds), phaseInputOf(project));
            const voteEnd = openVoteEndOf(index);
            return (
              <div key={p.projectId} className="glass-card" style={{ padding: "20px" }}>
                <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    <strong style={{ fontSize: "18px" }}>{name}</strong>
                    <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                      {chainName(p.chainId)} · {p.state} · {p.tokenSymbol}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                    <Stat label="Invested" value={`${formatEth(net.toString())} ${chainCurrency(p.chainId)}`} />
                    {BigInt(p.refunded) !== ZERO && (
                      <Stat label="Refunded" value={`${formatEth(p.refunded)} ${chainCurrency(p.chainId)}`} />
                    )}
                    <Stat label="Staked" value={`${formatToken(p.stakedBalance)} ${p.tokenSymbol}`} />
                    <Stat label="Token balance" value={`${formatToken(p.tokensHeld)} ${p.tokenSymbol}`} />
                    <Stat label="Yield claimed" value={`${formatEth(p.yieldClaimed)} ${chainCurrency(p.chainId)}`} />
                  </div>
                </Link>
                {(refundAvailable || voteEnd !== null) && (
                  <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {refundAvailable && (
                      <Link href={href} className="badge badge-pending">Refund available</Link>
                    )}
                    {voteEnd !== null && (
                      <Link href={`${href}/milestones`} className="badge badge-pending">
                        Vote open until {new Date(parseInt(voteEnd.toString(), 10) * 1000).toLocaleString()}
                      </Link>
                    )}
                  </div>
                )}
                <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--text-muted)" }}>
                  Claimable yield:{" "}
                  {claimable === null ? DASH : `${formatEth(claimable.toString())} ${chainCurrency(p.chainId)}`}
                  {" · "}
                  <Link href={href}>Claim</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <GaslessRequests />
      <MyComplaints />
    </div>
  );
}
