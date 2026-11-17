"use client";

import { useState } from "react";
import { useAccount, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { chainName } from "@/config/chains";
import { fetchProjectRevenue, formatNative, listProjects, shortAddr, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/explorer";
import { getFeeOverrides } from "@/lib/fees";

type Addr = `0x${string}`;

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;
const CELL = { padding: "8px", borderBottom: "1px solid var(--border)", fontSize: "14px", textAlign: "left" } as const;

interface Row {
  project: ProjectDto;
  router: Addr;
  claimed: string;
}

interface Pending {
  project: ProjectDto;
  router: Addr;
  treasury: Addr | null;
}

function asAddr(v: unknown): Addr | null {
  return typeof v === "string" && ADDRESS_REGEX.test(v) ? (v as Addr) : null;
}

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    const text = typeof e.shortMessage === "string" ? e.shortMessage : typeof e.message === "string" ? e.message : "";
    if (text.includes("No funds to claim")) return "No funds to claim: the pending fee was already sent.";
    if (text) return text;
  }
  return "Transaction failed";
}

async function loadAllProjects(signal: AbortSignal): Promise<{ items: ProjectDto[]; capped: boolean }> {
  const items: ProjectDto[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await listProjects(
      { limit: PAGE_LIMIT, offset: page * PAGE_LIMIT, sort: "created_at", order: "desc" },
      signal,
    );
    items.push(...res.items);
    if (items.length >= res.total || res.items.length === 0) return { items, capped: false };
  }
  return { items, capped: true };
}

function TxLink({ chainId, hash }: { chainId: number; hash: string }) {
  const url = explorerTxUrl(chainId, hash);
  if (!url || !url.startsWith("https://")) return <span>{hash}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>
      View transaction
    </a>
  );
}

export function PlatformFeesTab() {
  const { address, chainId: walletChainId } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [onlyPending, setOnlyPending] = useState(false);
  const [target, setTarget] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string; chainId?: number } | null>(null);
  const feeClient = usePublicClient({ chainId: target?.project.chainId });

  const projectsQuery = useQuery({
    queryKey: ["admin-fees-projects"],
    queryFn: ({ signal }) => loadAllProjects(signal),
  });
  const projects = projectsQuery.data?.items ?? [];

  const revenueQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project-revenue", p.id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchProjectRevenue(p.chainId, p.escrowAddress, signal),
    })),
  });

  const rows: Row[] = [];
  projects.forEach((p, i) => {
    const data = revenueQueries[i]?.data;
    const router = asAddr(data?.routerAddress);
    if (data && router) rows.push({ project: p, router, claimed: data.totals.totalTreasuryClaimed });
  });
  const revenueLoading = revenueQueries.some((q) => q.isLoading);

  const treasuryChains: { chainId: number; router: Addr }[] = [];
  for (const r of rows) {
    if (!treasuryChains.some((t) => t.chainId === r.project.chainId)) {
      treasuryChains.push({ chainId: r.project.chainId, router: r.router });
    }
  }

  const { data: reads, isLoading: readsLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      ...rows.map((r) => ({
        address: r.router,
        abi: ABIS.router,
        functionName: "treasuryPendingFunds" as const,
        chainId: r.project.chainId,
      })),
      ...treasuryChains.map((t) => ({
        address: t.router,
        abi: ABIS.router,
        functionName: "forgeCapitaTreasury" as const,
        chainId: t.chainId,
      })),
    ],
    query: { enabled: rows.length > 0 },
  });

  const pendingFor = (i: number): bigint | null => {
    const v = reads?.[i]?.result;
    return typeof v === "bigint" ? v : null;
  };
  const treasuryFor = (chainId: number): Addr | null => {
    const idx = treasuryChains.findIndex((t) => t.chainId === chainId);
    return idx < 0 ? null : asAddr(reads?.[rows.length + idx]?.result);
  };

  const totals = new Map<number, bigint>();
  rows.forEach((r, i) => {
    const v = pendingFor(i);
    if (v !== null) totals.set(r.project.chainId, (totals.get(r.project.chainId) ?? BigInt(0)) + v);
  });
  const anyPending = Array.from(totals.values()).some((v) => v > BigInt(0));
  const visible = rows
    .map((r, i) => ({ r, pending: pendingFor(i) }))
    .filter((x) => !onlyPending || (x.pending !== null && x.pending > BigInt(0)));

  async function send(): Promise<void> {
    if (!target || busy || walletChainId !== target.project.chainId) return;
    const { project, router } = target;
    setBusy(true);
    setResult(null);
    try {
      const fees = await getFeeOverrides(feeClient);
      const hash = await writeContractAsync({
        address: router,
        abi: ABIS.router,
        functionName: "claimTreasuryFunds",
        chainId: project.chainId,
        ...fees,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: project.chainId });
      if (receipt.status !== "success") {
        setResult({ ok: false, text: "Transaction failed (reverted).", hash, chainId: project.chainId });
      } else {
        setResult({
          ok: true,
          text: "Fee sent to the treasury. The indexer updates 'total claimed' after about a minute.",
          hash,
          chainId: project.chainId,
        });
        void refetch();
        void queryClient.invalidateQueries({ queryKey: ["project-revenue", project.id] });
      }
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
      void refetch();
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }

  let body: React.ReactNode;
  if (projectsQuery.isError) {
    body = <div role="alert" className="alert alert-error">Failed to load projects</div>;
  } else if (projectsQuery.isLoading || revenueLoading || (rows.length > 0 && readsLoading)) {
    body = <p style={{ color: "var(--text-secondary)" }}>Loading...</p>;
  } else if (rows.length === 0) {
    body = <p style={{ color: "var(--text-secondary)" }}>No projects with a revenue router.</p>;
  } else {
    body = (
      <>
        <div style={{ marginBottom: "12px" }}>
          {treasuryChains.map((t) => (
            <p key={t.chainId} style={MUTED}>
              {chainName(t.chainId)} treasury: {treasuryFor(t.chainId) ?? "Unavailable"}. Pending total:{" "}
              {formatNative((totals.get(t.chainId) ?? BigInt(0)).toString(), t.chainId, 6)}
            </p>
          ))}
        </div>
        <label style={{ fontSize: "14px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          Only with pending &gt; 0
        </label>
        {!anyPending && <p style={{ color: "var(--text-secondary)", marginBottom: "12px" }}>No router has pending platform fees.</p>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={CELL}>Project</th>
                <th style={CELL}>Chain</th>
                <th style={CELL}>Router</th>
                <th style={CELL}>Pending platform fee</th>
                <th style={CELL}>Total claimed to treasury</th>
                <th style={CELL} />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ r, pending }) => {
                const chainId = r.project.chainId;
                const wrongChain = address !== undefined && walletChainId !== chainId;
                const canSend = pending !== null && pending > BigInt(0) && address !== undefined && !wrongChain && !busy;
                return (
                  <tr key={r.project.id}>
                    <td style={CELL}>{r.project.profile?.name ?? r.project.tokenName}</td>
                    <td style={CELL}>{chainName(chainId)}</td>
                    <td style={CELL} title={r.router}>{shortAddr(r.router)}</td>
                    <td style={CELL}>{pending === null ? "Unavailable" : formatNative(pending.toString(), chainId, 6)}</td>
                    <td style={CELL}>{formatNative(r.claimed, chainId, 6)}</td>
                    <td style={CELL}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!canSend}
                        onClick={() => setTarget({ project: r.project, router: r.router, treasury: treasuryFor(chainId) })}
                      >
                        Send fee to treasury
                      </button>
                      {!address && <div style={MUTED}>Connect a wallet</div>}
                      {wrongChain && <div style={MUTED}>Switch your wallet to {chainName(chainId)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <section>
      <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Platform fees</h1>
      <p style={{ ...MUTED, marginBottom: "16px" }}>
        The 1% revenue platform fee accrues in each project&apos;s revenue router. The 5% funding fee and the 1% P2P fee are
        sent automatically.
      </p>
      {projectsQuery.data?.capped && (
        <p style={{ ...MUTED, marginBottom: "12px" }}>
          Showing the newest {PAGE_LIMIT * MAX_PAGES} projects only; older projects are not listed.
        </p>
      )}
      {result && (
        <div role={result.ok ? "status" : "alert"} className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginBottom: "12px" }}>
          <span>
            {result.text}
            {result.hash && result.chainId !== undefined && (
              <>
                {" "}
                <TxLink chainId={result.chainId} hash={result.hash} />
              </>
            )}
          </span>
        </div>
      )}
      {body}
      <ConfirmDialog
        open={target !== null}
        title="Send platform fee to treasury?"
        confirmLabel="Send transaction"
        busy={busy}
        confirmDisabled={target?.treasury === null}
        onConfirm={() => void send()}
        onCancel={() => setTarget(null)}
      >
        This sends this project&apos;s pending 1% platform fee to the ForgeCapita treasury address{" "}
        {target?.treasury ?? "(unavailable)"}. Anyone can trigger this; the funds always go to the treasury. You pay the
        network fee.
      </ConfirmDialog>
    </section>
  );
}
