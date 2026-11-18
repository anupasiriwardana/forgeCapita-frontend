"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useConfig, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { Briefcase, Coins, HandCoins, Plug, Sprout } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ProjectStatusBadge";
import { Amount } from "@/components/ui/Amount";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { CHART_PALETTE } from "@/components/ui/charts/ChartFrame";
import { DonutChart } from "@/components/ui/charts/DonutChart";
import {
  ApiError,
  describeApiError,
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

interface LoadError {
  message: string;
  requestId?: string;
}

/** Safe message plus the server request id (when present) for an ErrorState. */
function loadError(err: unknown, fallback: string): LoadError {
  return { message: describeApiError(err, fallback), requestId: err instanceof ApiError ? err.requestId : undefined };
}

interface ChainTotals {
  chainId: number;
  net: bigint;
  claimed: bigint;
  claimable: bigint;
  claimableKnown: boolean;
  count: number;
}

interface PositionRow {
  p: InvestorPosition;
  net: bigint;
  name: string;
  claimable: bigint | null;
  href: string;
  refundAvailable: boolean;
  voteEnd: bigint | null;
}

function relayTone(status: string): StatusTone {
  if (status === "CONFIRMED") return "success";
  if (status === "FAILED" || status === "EXPIRED") return "neutral";
  return "warning";
}

/** Share of `part` in `total` as text with one decimal, bigint math only. */
function shareText(part: bigint, total: bigint): string {
  if (total <= ZERO) return "0.0%";
  const tenths = (part * BigInt(1000)) / total;
  return `${(tenths / BigInt(10)).toString()}.${(tenths % BigInt(10)).toString()}%`;
}

function PositionActions({ row }: { row: PositionRow }) {
  return (
    <div className="row-actions">
      {row.voteEnd !== null && (
        <ButtonLink
          href={`${row.href}/milestones`}
          variant="subtle"
          size="sm"
          title={`Vote open until ${new Date(parseInt(row.voteEnd.toString(), 10) * 1000).toLocaleString()}`}
        >
          Vote
        </ButtonLink>
      )}
      {row.refundAvailable && (
        <ButtonLink href={row.href} variant="secondary" size="sm">
          Refund
        </ButtonLink>
      )}
      <ButtonLink href={row.href} variant="ghost" size="sm">
        Claim
      </ButtonLink>
    </div>
  );
}

/** KPI cards and (with 2+ positions) an allocation donut for one chain; never summed across chains. */
function ChainSummary({ totals, rows }: { totals: ChainTotals; rows: PositionRow[] }) {
  const currency = chainCurrency(totals.chainId);
  const funded = rows.filter((r) => r.net > ZERO);
  const showAllocation = rows.length >= 2 && funded.length > 0;
  const slices = funded.map((r) => ({ name: r.name, value: Number(formatEth(r.net.toString(), 6)) }));
  const summary = `Net invested on ${chainName(totals.chainId)} by project: ${funded
    .map((r) => `${r.name} ${formatEth(r.net.toString())} ${currency} (${shareText(r.net, totals.net)})`)
    .join(", ")}.`;

  return (
    <div className="chain-block">
      <div className="chain-block-head">
        <h3 style={{ fontSize: 15 }}>{chainName(totals.chainId)}</h3>
      </div>
      <div className="kpi-grid" style={{ marginBottom: showAllocation ? 12 : 0 }}>
        <StatCard label="Net invested" value={formatEth(totals.net.toString())} unit={currency} icon={<Coins size={16} />} />
        <StatCard
          label="Claimable yield"
          value={totals.claimableKnown ? formatEth(totals.claimable.toString()) : DASH}
          unit={totals.claimableKnown ? currency : undefined}
          hint={totals.claimableKnown ? undefined : "Reading from the chain"}
          icon={<Sprout size={16} />}
        />
        <StatCard label="Yield claimed" value={formatEth(totals.claimed.toString())} unit={currency} icon={<HandCoins size={16} />} />
        <StatCard label="Positions" value={totals.count} icon={<Briefcase size={16} />} />
      </div>
      {showAllocation && (
        <Card>
          <CardHeader title="Allocation" subtitle={`Net invested by project, in ${currency}`} as="h4" />
          <CardBody>
            <div className="allocation">
              <DonutChart
                data={slices}
                summary={summary}
                height={200}
                centerValue={formatEth(totals.net.toString(), 3)}
                centerLabel={currency}
                formatter={(v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${currency}`}
              />
              <ul className="allocation-legend">
                {funded.map((r, i) => (
                  <li key={r.p.projectId}>
                    <span style={{ display: "inline-flex", alignItems: "center", minWidth: 0 }}>
                      <span className="legend-swatch" aria-hidden="true" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    </span>
                    <span className="num" style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>
                      <Amount value={formatEth(r.net.toString())} unit={currency} /> {shareText(r.net, totals.net)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function GaslessRequests() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<RelayRequest[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
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
        setError(loadError(err, "Failed to load gasless requests"));
      });
    return () => controller.abort();
  }, [signedIn, reloadKey]);

  const retry = useCallback(() => {
    setError(null);
    setItems(null);
    setReloadKey((k) => k + 1);
  }, []);

  const columns: ReadonlyArray<DataTableColumn<RelayRequest>> = [
    {
      key: "kind",
      header: "Action",
      cell: (r) => {
        const failure = failureOfRequest(r);
        return (
          <div>
            <span style={{ fontWeight: 600 }}>{r.kind}</span>
            {failure && <div className="cell-sub" style={{ color: "var(--danger)" }}>{failure.message}</div>}
          </div>
        );
      },
    },
    { key: "status", header: "Status", cell: (r) => <StatusPill tone={relayTone(r.status)}>{r.status}</StatusPill> },
    { key: "chain", header: "Chain", cell: (r) => <span className="cell-sub" style={{ fontSize: 13 }}>{chainName(r.chainId)}</span> },
    {
      key: "created",
      header: "Created",
      numeric: true,
      cell: (r) => {
        const created = new Date(r.createdAt);
        return <span className="cell-sub" style={{ fontSize: 13 }}>{Number.isNaN(created.getTime()) ? DASH : created.toLocaleString()}</span>;
      },
    },
    {
      key: "links",
      header: <span className="sr-only">Links</span>,
      align: "right",
      cell: (r) => {
        const txUrl = r.txHash ? explorerTxUrl(r.chainId, r.txHash) : null;
        return (
          <div className="row-actions">
            <ButtonLink href={`/projects/${encodeURIComponent(r.projectId)}`} variant="ghost" size="sm">Project</ButtonLink>
            {txUrl && (
              <a href={txUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                Transaction
              </a>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <section id="gasless-requests" className="section-block" aria-labelledby="gasless-heading">
      <Card>
        <CardHeader title={<span id="gasless-heading">Gasless requests</span>} subtitle="Actions the platform relayed for you, newest first." />
        <CardBody style={{ paddingLeft: 0, paddingRight: 0, paddingBottom: 4 }}>
          {!signedIn && (
            <p className="panel-note" style={{ padding: "0 20px 12px" }}>
              {authLoading ? "Checking sign-in…" : "Sign in to see your gasless requests"}
            </p>
          )}

          {signedIn && error && (
            <ErrorState title="Could not load gasless requests" message={error.message} requestId={error.requestId} onRetry={retry} />
          )}

          {signedIn && !error && (
            <DataTable
              columns={columns}
              rows={items ?? []}
              rowKey={(r) => r.id}
              caption="Gasless requests"
              loading={items === null}
              skeletonRows={3}
              emptyTitle="No gasless requests yet"
              emptyText="Gasless stakes, claims and votes you submit will appear here."
            />
          )}
        </CardBody>
      </Card>
    </section>
  );
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const { role } = useAuth();
  const [positions, setPositions] = useState<InvestorPosition[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [distributors, setDistributors] = useState<Record<string, Addr>>({});
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [projects, setProjects] = useState<Record<string, ProjectDto>>({});
  const [error, setError] = useState<LoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setError(null);
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
        setError(loadError(err, "Failed to load positions"));
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

  function refundAvailableOf(p: InvestorPosition): boolean {
    const project = projects[p.projectId];
    return (
      BigInt(p.invested) - BigInt(p.refunded) > ZERO &&
      project !== undefined &&
      refundsOpenFor(BigInt(nowSeconds), phaseInputOf(project))
    );
  }

  // Per-chain totals (different chains use different currencies, so never summed across chains).
  const chainTotals = new Map<number, ChainTotals>();
  let refundCount = 0;
  let openVoteCount = 0;
  (positions ?? []).forEach((p, index) => {
    const totals = chainTotals.get(p.chainId) ?? {
      chainId: p.chainId,
      net: ZERO,
      claimed: ZERO,
      claimable: ZERO,
      claimableKnown: true,
      count: 0,
    };
    totals.count += 1;
    totals.net += BigInt(p.invested) - BigInt(p.refunded);
    totals.claimed += BigInt(p.yieldClaimed);
    const claimable = claimableOf(index);
    if (claimable === null) totals.claimableKnown = false;
    else totals.claimable += claimable;
    chainTotals.set(p.chainId, totals);
    if (refundAvailableOf(p)) refundCount++;
    if (openVoteEndOf(index) !== null) openVoteCount++;
  });
  const summaryChains = Array.from(chainTotals.values());
  const founderLink = role === "founder";

  const rows: PositionRow[] = (positions ?? []).map((p, index) => {
    const href = `/projects/${encodeURIComponent(p.projectId)}`;
    return {
      p,
      net: BigInt(p.invested) - BigInt(p.refunded),
      name: names[p.projectId] || p.tokenSymbol || shortAddr(p.escrowAddress),
      claimable: claimableOf(index),
      href,
      refundAvailable: refundAvailableOf(p),
      voteEnd: openVoteEndOf(index),
    };
  });
  const loading = isConnected && !error && positions === null;
  const hasPositions = isConnected && !error && positions !== null && positions.length > 0;

  const columns: ReadonlyArray<DataTableColumn<PositionRow>> = [
    {
      key: "project",
      header: "Project",
      cell: (r) => (
        <div>
          <Link href={r.href} className="cell-title">{r.name}</Link>
          {r.p.tokenSymbol && <div className="cell-sub mono">{r.p.tokenSymbol}</div>}
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      cell: (r) => (
        <div>
          <ProjectStatusBadge status={r.p.state} />
          <div className="cell-sub" style={{ marginTop: 4, whiteSpace: "nowrap" }}>{chainName(r.p.chainId)}</div>
        </div>
      ),
    },
    {
      key: "invested",
      header: "Invested",
      align: "right",
      cell: (r) => (
        <div>
          <Amount value={formatEth(r.net.toString())} unit={chainCurrency(r.p.chainId)} />
          {BigInt(r.p.refunded) !== ZERO && (
            <div className="cell-sub num">Refunded {formatEth(r.p.refunded)} {chainCurrency(r.p.chainId)}</div>
          )}
        </div>
      ),
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      cell: (r) => (
        <div>
          <Amount value={formatToken(r.p.tokensHeld)} />
          <span className="sr-only"> held</span>
          <div className="cell-sub num">Staked {formatToken(r.p.stakedBalance)}</div>
        </div>
      ),
    },
    {
      key: "claimable",
      header: "Claimable",
      align: "right",
      cell: (r) => (
        <div>
          {r.claimable === null ? <span className="mono">{DASH}</span> : <Amount value={formatEth(r.claimable.toString())} unit={chainCurrency(r.p.chainId)} />}
          <div className="cell-sub num">Claimed {formatEth(r.p.yieldClaimed)}</div>
        </div>
      ),
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", cell: (r) => <PositionActions row={r} /> },
  ];

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <h1>Portfolio</h1>
          <p>Your positions, yield and requests across both testnets. Totals are per chain because each chain uses its own currency.</p>
        </div>
        {hasPositions && (refundCount > 0 || openVoteCount > 0) && (
          <div className="page-title-actions">
            {refundCount > 0 && <StatusPill tone="warning">Refunds available: {refundCount}</StatusPill>}
            {openVoteCount > 0 && <StatusPill tone="warning">Open votes: {openVoteCount}</StatusPill>}
          </div>
        )}
      </div>

      <nav aria-label="Portfolio shortcuts" className="quick-links">
        <ButtonLink href="/projects" variant="secondary" size="sm">Browse projects</ButtonLink>
        <ButtonLink href="/p2p" variant="secondary" size="sm">P2P market</ButtonLink>
        <a href="#gasless-requests" className={buttonClass("ghost", "sm")}>Gasless requests</a>
        <a href="#my-complaints" className={buttonClass("ghost", "sm")}>My complaints</a>
        {founderLink && <ButtonLink href="/founder/projects" variant="ghost" size="sm">Founder projects</ButtonLink>}
      </nav>

      {isConnected && positions !== null && positions.length > 0 && (
        <IndexerLagNote chainId={Array.from(new Set(positions.map((p) => p.chainId)))} />
      )}

      {!isConnected && (
        <Card>
          <EmptyState icon={<Plug size={20} />} title="Connect your wallet" text="Connect your wallet to see your positions." />
        </Card>
      )}

      {isConnected && error && (
        <Card>
          <ErrorState title="Could not load positions" message={error.message} requestId={error.requestId} onRetry={retry} />
        </Card>
      )}

      {loading && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading positions</span>
          <div className="kpi-grid">
            {[1, 2, 3, 4].map((n) => (
              <StatCard key={n} label="Loading" value="" loading />
            ))}
          </div>
          <Card>
            <DataTable columns={columns} rows={[]} rowKey={(r) => r.p.projectId} caption="Positions" loading skeletonRows={3} />
          </Card>
        </div>
      )}

      {isConnected && !error && positions !== null && positions.length === 0 && (
        <Card>
          <EmptyState
            icon={<Briefcase size={20} />}
            title="No positions yet"
            text="Fund a project to see your investment, tokens and yield here."
            action={<ButtonLink href="/projects">Browse projects</ButtonLink>}
          />
        </Card>
      )}

      {hasPositions && (
        <section aria-labelledby="portfolio-summary">
          <h2 id="portfolio-summary" className="sr-only">Summary</h2>
          {summaryChains.map((c) => (
            <ChainSummary key={c.chainId} totals={c} rows={rows.filter((r) => r.p.chainId === c.chainId)} />
          ))}
        </section>
      )}

      {hasPositions && (
        <section aria-labelledby="positions-heading" className="section-block table-switch">
          <div className="chain-block-head">
            <h2 id="positions-heading" style={{ fontSize: 16 }}>
              Positions <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}>({positions.length})</span>
            </h2>
          </div>
          <Card className="only-desktop">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.p.projectId} caption="Your positions" />
          </Card>
          <div className="only-mobile">
            <div className="mobile-cards">
              {rows.map((r) => (
                <Card key={r.p.projectId} className="mobile-card">
                  <div className="mobile-card-head">
                    <div style={{ minWidth: 0 }}>
                      <Link href={r.href} className="cell-title">{r.name}</Link>
                      <div className="cell-sub">{chainName(r.p.chainId)}{r.p.tokenSymbol ? ` - ${r.p.tokenSymbol}` : ""}</div>
                    </div>
                    <ProjectStatusBadge status={r.p.state} />
                  </div>
                  <div className="kv-list">
                    <div className="kv-row"><span>Invested</span><Amount value={formatEth(r.net.toString())} unit={chainCurrency(r.p.chainId)} /></div>
                    {BigInt(r.p.refunded) !== ZERO && (
                      <div className="kv-row"><span>Refunded</span><Amount value={formatEth(r.p.refunded)} unit={chainCurrency(r.p.chainId)} /></div>
                    )}
                    <div className="kv-row"><span>Tokens held</span><Amount value={formatToken(r.p.tokensHeld)} unit={r.p.tokenSymbol || undefined} /></div>
                    <div className="kv-row"><span>Staked</span><Amount value={formatToken(r.p.stakedBalance)} unit={r.p.tokenSymbol || undefined} /></div>
                    <div className="kv-row">
                      <span>Claimable yield</span>
                      {r.claimable === null ? <span className="mono">{DASH}</span> : <Amount value={formatEth(r.claimable.toString())} unit={chainCurrency(r.p.chainId)} />}
                    </div>
                    <div className="kv-row"><span>Yield claimed</span><Amount value={formatEth(r.p.yieldClaimed)} unit={chainCurrency(r.p.chainId)} /></div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <PositionActions row={r} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      <GaslessRequests />
      <div id="my-complaints" className="section-block">
        <MyComplaints />
      </div>
    </div>
  );
}
