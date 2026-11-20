"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReadContracts } from "wagmi";
import {
  fetchGasLedger,
  formatNative,
  shortAddr,
  type GasLedgerResponse,
  type GasSponsoredRow,
  type ProjectDto,
} from "@/lib/api";
import { Fuel } from "lucide-react";
import { ABIS } from "@/lib/contracts";
import { EXPLORER_URLS } from "@/config/chains";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";

const PAGE_SIZE = 20;
const MAX_LIMIT = 200;
const REFRESH_MS = 30_000;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const DASH = "—";

// Registry action kinds (MilestoneEscrow / DividendDistributor ACTION_*): Claim, Stake, Vote, Execute = 0..3.
const ACTION_LABELS: readonly string[] = ["Claim", "Stake", "Vote", "Execute"];

function actionLabel(action: number): string {
  return ACTION_LABELS[action] ?? `Action ${action}`;
}

function txLink(chainId: number, hash: string): string | null {
  if (!TX_HASH_REGEX.test(hash)) return null;
  const base = (EXPLORER_URLS as Record<number, string | undefined>)[chainId];
  if (!base || !base.startsWith("https://")) return null;
  return `${base}/tx/${hash}`;
}

function formatTime(seconds: string): string {
  return new Date(Number(seconds) * 1000).toLocaleString();
}

/**
 * Gas sponsorship card. Indexer figures come from the gas-ledger route; the budget and ceiling are read from
 * MilestoneEscrow (public gasBudget, netFunds, MAX_DEBT_BPS): ceiling = gasBudget + netFunds * MAX_DEBT_BPS / 10000,
 * the same bound _bookGas enforces ("Gas ceiling exceeded").
 */
export function GasLedger({ project }: { project: ProjectDto }) {
  const { chainId, escrowAddress } = project;
  const [action, setAction] = useState<number | undefined>(undefined);
  const [ledger, setLedger] = useState<GasLedgerResponse | null>(null);
  const [rows, setRows] = useState<GasSponsoredRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const rowCount = useRef(0);

  const escrow = escrowAddress as `0x${string}`;
  const { data: chain } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "gasBudget", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "netFunds", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "MAX_DEBT_BPS", chainId },
    ],
  });

  const refresh = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      // Keep already-loaded pages: refetch as many newest rows as are on screen.
      const limit = Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, rowCount.current));
      try {
        const data = await fetchGasLedger(chainId, escrowAddress, { limit, offset: 0, action }, signal);
        if (signal.aborted) return;
        setLedger(data);
        setRows(data?.sponsored ?? []);
        rowCount.current = data?.sponsored.length ?? 0;
        setHasMore((data?.sponsored.length ?? 0) === limit);
        setError(null);
      } catch {
        if (signal.aborted) return;
        setError("Could not load the gas ledger.");
      } finally {
        if (!signal.aborted) setLoaded(true);
      }
    },
    [chainId, escrowAddress, action],
  );

  useEffect(() => {
    rowCount.current = 0;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  async function showMore(): Promise<void> {
    setPaging(true);
    try {
      const data = await fetchGasLedger(chainId, escrowAddress, { limit: PAGE_SIZE, offset: rows.length, action });
      const next = data?.sponsored ?? [];
      setRows(prev => [...prev, ...next]);
      rowCount.current += next.length;
      setHasMore(next.length === PAGE_SIZE);
      setError(null);
    } catch {
      setError("Could not load more rows.");
    } finally {
      setPaging(false);
    }
  }

  if (!loaded) return null;
  if (!ledger && error) {
    return <InlineAlert tone="warning">{error}</InlineAlert>;
  }

  const summary = ledger?.summary;
  const debtRows = ledger?.debt ?? [];
  const noActivity = !summary || (summary.actionCount === 0 && action === undefined);
  if (noActivity && project.state === "FUNDING" && debtRows.length === 0) return null;

  const budget = chain?.[0]?.result;
  const netFunds = chain?.[1]?.result;
  const bps = chain?.[2]?.result;
  const ceiling =
    typeof budget === "bigint" && typeof netFunds === "bigint" && typeof bps === "bigint"
      ? budget + (netFunds * bps) / BigInt(10000)
      : null;
  const spentWei = summary?.gasSpent ?? "0";
  const spent = BigInt(spentWei);
  let pct = BigInt(0);
  if (ceiling !== null && ceiling > BigInt(0)) {
    pct = (spent * BigInt(100)) / ceiling;
    if (pct > BigInt(100)) pct = BigInt(100);
  }

  const columns: ReadonlyArray<DataTableColumn<GasSponsoredRow>> = [
    { key: "time", header: "Time", numeric: true, cell: (r) => <span className="cell-sub" style={{ fontSize: 12 }}>{formatTime(r.timestamp)}</span> },
    { key: "action", header: "Action", cell: (r) => actionLabel(r.action) },
    { key: "who", header: "Who", cell: (r) => <span className="mono" style={{ fontSize: 12 }} title={r.account}>{shortAddr(r.account)}</span> },
    { key: "cost", header: "Cost", align: "right", cell: (r) => <Amount value={formatNative(r.cost, chainId, 6)} /> },
    {
      key: "tx",
      header: "Tx",
      align: "right",
      cell: (r) => {
        const link = txLink(chainId, r.txHash);
        return link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mono link-accent" style={{ fontSize: 12 }}>
            {r.txHash.slice(0, 8)}…{r.txHash.slice(-4)}
          </a>
        ) : (
          <span className="mono">{DASH}</span>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader
        title={
          <span className="panel-title">
            <Fuel size={16} aria-hidden="true" />
            Gas sponsorship
          </span>
        }
        actions={
          <span className="inline-actions">
            <label htmlFor="gas-ledger-action" className="panel-note">Action</label>
            <Select
              id="gas-ledger-action"
              style={{ width: "auto", padding: "6px 32px 6px 10px", fontSize: "13px" }}
              value={action === undefined ? "all" : String(action)}
              onChange={e => {
                const v = e.target.value;
                setAction(v === "all" ? undefined : Number(v));
              }}
            >
              <option value="all">All</option>
              {ACTION_LABELS.map((label, i) => (
                <option key={label} value={String(i)}>{label}</option>
              ))}
            </Select>
          </span>
        }
      />
      <CardBody>
        <IndexerLagNote chainId={chainId} />
        <p className="panel-note panel-gap">
          The platform pays the network fee for your gasless claim, vote and stake (relayed actions). The cost is
          booked against this project&apos;s gas budget (taken from the 5% platform fee at funding close).
        </p>

        <div className="kv-list">
          <div className="kv-row"><span>Total gas sponsored</span><Amount value={formatNative(spentWei, chainId, 6)} /></div>
          {typeof budget === "bigint" && (
            <div className="kv-row"><span>Gas budget</span><Amount value={formatNative(budget.toString(), chainId, 6)} /></div>
          )}
          {ceiling !== null && (
            <div className="kv-row"><span>Ceiling</span><Amount value={formatNative(ceiling.toString(), chainId, 6)} /></div>
          )}
        </div>

        {ceiling !== null && ceiling > BigInt(0) && (
          <div style={{ marginTop: 12 }}>
            <div
              className="progress-bar"
              role="progressbar"
              aria-label="Gas ceiling used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={parseInt(pct.toString(), 10)}
              style={{ marginBottom: 6 }}
            >
              <div className="progress-fill" style={{ width: `${pct.toString()}%` }} />
            </div>
            <span className="panel-note num">
              Used {formatNative(spentWei, chainId, 6)} of {formatNative(ceiling.toString(), chainId, 6)}
            </span>
          </div>
        )}
      </CardBody>

      <div style={{ borderTop: "1px solid var(--border)" }}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          caption="Sponsored actions"
          dense
          emptyTitle="No sponsored actions yet."
        />
      </div>

      {(hasMore || error || (debtRows.length > 0 && summary)) && (
        <CardBody style={{ borderTop: "1px solid var(--border)" }}>
          {hasMore && (
            <Button variant="secondary" size="sm" loading={paging} onClick={() => void showMore()}>
              {paging ? "Loading…" : "Show more"}
            </Button>
          )}
          {error && <p className="panel-note" style={{ marginTop: hasMore ? 8 : 0 }}>{error}</p>}

          {debtRows.length > 0 && summary && (
            <div className={hasMore || error ? "panel-section" : undefined} style={{ fontSize: 13 }}>
              <div className="kv-row">
                <span>Gas debt: sponsored gas repaid from milestone payouts</span>
                <Amount value={formatNative(summary.debtRecovered, chainId, 6)} />
              </div>
              <p className="panel-note" style={{ marginTop: 4 }}>
                Sponsored gas above the budget is deducted from milestone payouts and paid to the treasury, up to 15%
                of each payout.
                {summary.outstanding !== null && <> Still outstanding: {formatNative(summary.outstanding, chainId, 6)}.</>}
                {BigInt(summary.debtWrittenOff) > BigInt(0) && (
                  <> Written off at the final milestone: {formatNative(summary.debtWrittenOff, chainId, 6)}.</>
                )}
              </p>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}
