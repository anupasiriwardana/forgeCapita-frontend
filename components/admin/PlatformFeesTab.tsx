"use client";

import { useState } from "react";
import { useAccount, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatCard } from "@/components/ui/StatCard";
import { chainName } from "@/config/chains";
import { fetchProjectRevenue, formatNative, listProjects, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorer";
import { getFeeOverrides } from "@/lib/fees";
import { toast } from "@/lib/toast";
import { isUserRejection, txErrorMessage, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
import { AdminPageHeader } from "./shared";

type Addr = `0x${string}`;

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

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

/** Short error text; the contract's "No funds to claim" revert is mapped to a plain explanation. */
function errMessage(err: unknown): string {
  const raw = typeof err === "object" && err !== null ? (err as { message?: unknown }).message : undefined;
  const text = txErrorMessage(err, "");
  if (text.includes("No funds to claim") || (typeof raw === "string" && raw.includes("No funds to claim"))) {
    return "No funds to claim: the pending fee was already sent.";
  }
  return text || "Transaction failed";
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
    <a href={url} target="_blank" rel="noopener noreferrer" className="link-accent">
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
        toast.error("Transaction failed (reverted).");
        setResult({ ok: false, text: "Transaction failed (reverted).", hash, chainId: project.chainId });
      } else {
        toast.success("Fee sent to the treasury", { description: "The transaction link is shown on the page." });
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
      if (isUserRejection(err)) {
        toast.info(WALLET_CANCELLED_MESSAGE);
      } else {
        const text = errMessage(err);
        toast.error(text);
        setResult({ ok: false, text });
      }
      void refetch();
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }

  const loadingAll = projectsQuery.isLoading || revenueLoading || (rows.length > 0 && readsLoading);

  const columns: ReadonlyArray<DataTableColumn<{ r: Row; pending: bigint | null }>> = [
    { key: "project", header: "Project", cell: ({ r }) => <span className="cell-title">{r.project.profile?.name ?? r.project.tokenName}</span> },
    { key: "chain", header: "Network", cell: ({ r }) => <span className="cell-sub" style={{ fontSize: 13 }}>{chainName(r.project.chainId)}</span> },
    { key: "router", header: "Router", cell: ({ r }) => <AddressChip address={r.router} /> },
    {
      key: "pending",
      header: "Pending fee",
      align: "right",
      numeric: true,
      cell: ({ r, pending }) =>
        pending === null ? <span className="cell-sub">Unavailable</span> : <Amount value={formatNative(pending.toString(), r.project.chainId, 6)} />,
    },
    {
      key: "claimed",
      header: "Claimed to treasury",
      align: "right",
      numeric: true,
      cell: ({ r }) => <Amount value={formatNative(r.claimed, r.project.chainId, 6)} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: ({ r, pending }) => {
        const chainId = r.project.chainId;
        const wrongChain = address !== undefined && walletChainId !== chainId;
        const canSend = pending !== null && pending > BigInt(0) && address !== undefined && !wrongChain && !busy;
        return (
          <div className="stack-sm" style={{ alignItems: "flex-end", gap: 4 }}>
            <Button
              size="sm"
              disabled={!canSend}
              onClick={() => setTarget({ project: r.project, router: r.router, treasury: treasuryFor(chainId) })}
            >
              Send to treasury
            </Button>
            {!address && <span className="cell-sub cell-nowrap">Connect a wallet</span>}
            {wrongChain && <span className="cell-sub cell-nowrap">Switch to {chainName(chainId)}</span>}
          </div>
        );
      },
    },
  ];

  let body: React.ReactNode;
  if (projectsQuery.isError) {
    body = (
      <Card>
        <ErrorState title="Could not load projects" message="Failed to load projects" onRetry={() => void projectsQuery.refetch()} />
      </Card>
    );
  } else {
    body = (
      <>
        <div className="kpi-grid">
          {loadingAll && (
            <>
              <StatCard label="Pending platform fees" value="" loading />
              <StatCard label="Pending platform fees" value="" loading />
            </>
          )}
          {!loadingAll &&
            treasuryChains.map((t) => {
              const treasury = treasuryFor(t.chainId);
              const href = treasury ? explorerAddressUrl(t.chainId, treasury) : null;
              return (
                <StatCard
                  key={t.chainId}
                  label={`${chainName(t.chainId)} pending total`}
                  icon={<Landmark size={16} />}
                  value={<Amount value={formatNative((totals.get(t.chainId) ?? BigInt(0)).toString(), t.chainId, 6)} />}
                  hint={
                    treasury ? (
                      <>
                        Treasury <AddressChip address={treasury} href={href ?? undefined} />
                      </>
                    ) : (
                      "Treasury: Unavailable"
                    )
                  }
                />
              );
            })}
        </div>
        {!loadingAll && rows.length > 0 && !anyPending && (
          <InlineAlert tone="info" className="panel-gap">
            No router has pending platform fees.
          </InlineAlert>
        )}
        <Card className="admin-toolbar">
          <label className="admin-check">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Only with pending &gt; 0
          </label>
        </Card>
        <Card className="admin-table-card">
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={({ r }) => r.project.id}
            caption="Revenue routers and pending platform fees"
            loading={loadingAll}
            dense
            stickyHeader
            emptyTitle={rows.length === 0 ? "No projects with a revenue router." : "No routers match the filter."}
          />
        </Card>
      </>
    );
  }

  return (
    <section>
      <AdminPageHeader
        title="Platform fees"
        description="The 1% revenue platform fee accrues in each project's revenue router. The 5% funding fee and the 1% P2P fee are sent automatically."
      />
      {projectsQuery.data?.capped && (
        <InlineAlert tone="info" className="panel-gap">
          Showing the newest {PAGE_LIMIT * MAX_PAGES} projects only; older projects are not listed.
        </InlineAlert>
      )}
      {result && (
        <InlineAlert tone={result.ok ? "success" : "danger"} className="panel-gap">
          {result.text}
          {result.hash && result.chainId !== undefined && (
            <>
              {" "}
              <TxLink chainId={result.chainId} hash={result.hash} />
            </>
          )}
        </InlineAlert>
      )}
      {body}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
        title="Send platform fee to treasury?"
        body={
          <>
            This sends this project&apos;s pending 1% platform fee to the ForgeCapita treasury address{" "}
            <span className="mono">{target?.treasury ?? "(unavailable)"}</span>. Anyone can trigger this; the funds always go
            to the treasury. You pay the network fee.
          </>
        }
        confirmLabel="Send transaction"
        confirmDisabled={target?.treasury === null}
        onConfirm={send}
      />
    </section>
  );
}
