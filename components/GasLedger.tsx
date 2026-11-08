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
import { ABIS } from "@/lib/contracts";
import { EXPLORER_URLS } from "@/config/chains";

const PAGE_SIZE = 20;
const MAX_LIMIT = 200;
const REFRESH_MS = 30_000;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;

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
    return <p style={{ ...MUTED, marginBottom: "24px" }}>{error}</p>;
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

  return (
    <div className="glass-card" style={{ padding: "20px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Gas sponsorship</h2>
      <p style={{ ...MUTED, marginTop: 0, marginBottom: "12px" }}>
        The platform pays the network fee for your gasless claim, vote and stake (relayed actions). The cost is
        booked against this project&apos;s gas budget (taken from the 5% platform fee at funding close).
      </p>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px", marginBottom: "10px" }}>
        <span>Total gas sponsored: <strong>{formatNative(spentWei, chainId, 6)}</strong></span>
        {typeof budget === "bigint" && (
          <span>Gas budget: <strong>{formatNative(budget.toString(), chainId, 6)}</strong></span>
        )}
        {ceiling !== null && (
          <span>Ceiling: <strong>{formatNative(ceiling.toString(), chainId, 6)}</strong></span>
        )}
      </div>

      {ceiling !== null && ceiling > BigInt(0) && (
        <div style={{ marginBottom: "12px" }}>
          <div className="progress-bar" style={{ height: "6px", marginBottom: "4px" }}>
            <div className="progress-fill" style={{ width: `${pct.toString()}%` }} />
          </div>
          <span style={MUTED}>
            Used {formatNative(spentWei, chainId, 6)} of {formatNative(ceiling.toString(), chainId, 6)}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <label htmlFor="gas-ledger-action" style={MUTED}>Action</label>
        <select
          id="gas-ledger-action"
          className="input-field"
          style={{ width: "auto", padding: "4px 8px", fontSize: "13px" }}
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
        </select>
      </div>

      {rows.length === 0 ? (
        <p style={{ ...MUTED, margin: 0 }}>No sponsored actions yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                <th>Time</th>
                <th>Action</th>
                <th>Who</th>
                <th>Cost</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const link = txLink(chainId, r.txHash);
                return (
                  <tr key={r.id}>
                    <td>{formatTime(r.timestamp)}</td>
                    <td>{actionLabel(r.action)}</td>
                    <td style={{ fontFamily: "monospace" }}>{shortAddr(r.account)}</td>
                    <td>{formatNative(r.cost, chainId, 6)}</td>
                    <td style={{ fontFamily: "monospace" }}>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          {r.txHash.slice(0, 8)}…{r.txHash.slice(-4)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="btn-secondary"
          style={{ marginTop: "10px", padding: "6px 12px", fontSize: "12px" }}
          disabled={paging}
          onClick={() => void showMore()}
        >
          {paging ? "Loading…" : "Show more"}
        </button>
      )}
      {error && <p style={{ ...MUTED, marginTop: "8px", marginBottom: 0 }}>{error}</p>}

      {debtRows.length > 0 && summary && (
        <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border)", fontSize: "13px" }}>
          <div>
            Gas debt: sponsored gas repaid from milestone payouts:{" "}
            <strong>{formatNative(summary.debtRecovered, chainId, 6)}</strong>
          </div>
          <p style={{ ...MUTED, margin: "4px 0 0" }}>
            Sponsored gas above the budget is deducted from milestone payouts and paid to the treasury, up to 15%
            of each payout.
            {summary.outstanding !== null && <> Still outstanding: {formatNative(summary.outstanding, chainId, 6)}.</>}
            {BigInt(summary.debtWrittenOff) > BigInt(0) && (
              <> Written off at the final milestone: {formatNative(summary.debtWrittenOff, chainId, 6)}.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
