"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { chainName } from "@/config/chains";
import {
  fetchRelayStatus,
  listAdminRelayRequests,
  shortAddr,
  type RelayBalanceBucket,
  type RelayKind,
  type RelayRequestStatus,
  type RelayStatusDto,
} from "@/lib/api";
import { ADMIN_PAGE_SIZE, AdminPager, ListState, ROW_STYLE, truncate, useAdminList } from "./shared";
import { explorerTxUrl } from "@/lib/explorer";

const KINDS: RelayKind[] = ["claim", "stake", "vote", "execute"];
const STATUSES: RelayRequestStatus[] = ["QUEUED", "SENDING", "SENT", "CONFIRMED", "FAILED", "EXPIRED"];
const CHAINS = [421614, 97];
const COLUMNS = "1.3fr 0.7fr 1.1fr 1.1fr 1fr 0.9fr 1.4fr 1fr";
const POLL_MS = 30_000;

function requestBadge(status: RelayRequestStatus): string {
  if (status === "CONFIRMED") return "badge-active";
  if (status === "FAILED" || status === "EXPIRED") return "badge-inactive";
  return "badge-pending";
}

function balanceBadge(balance: RelayBalanceBucket): string {
  if (balance === "ok") return "badge-active";
  if (balance === "unknown") return "badge-pending";
  return "badge-inactive";
}

function RelayerStatusStrip({ reloadKey }: { reloadKey: number }) {
  const [state, setState] = useState<{ reloadKey: number; status: RelayStatusDto | null; error: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchRelayStatus(signal)
      .then((status) => {
        if (!signal.aborted) setState({ reloadKey, status, error: false });
      })
      .catch(() => {
        if (!signal.aborted) setState({ reloadKey, status: null, error: true });
      });
    return () => controller.abort();
  }, [reloadKey]);

  const chains = state?.status?.chains ?? [];
  const warn = chains.some((c) => c.enabled && (c.balance === "low" || c.balance === "empty"));

  return (
    <div
      className={warn ? "alert alert-warning" : "glass-card"}
      style={{ padding: "10px 12px", marginBottom: "16px", display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "13px" }}
      aria-label="Relayer status"
    >
      <strong>Relayer status</strong>
      {state === null && <span style={{ color: "var(--text-secondary)" }}>Loading…</span>}
      {state?.error && <span>Status unavailable</span>}
      {chains.map((c) => (
        <span key={c.chainId} style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
          {chainName(c.chainId)}:
          {c.enabled ? (
            <>
              <span title={c.relayerAddress}>{c.relayerAddress ? shortAddr(c.relayerAddress) : "-"}</span>
              <span className={`badge ${balanceBadge(c.balance ?? "unknown")}`}>{c.balance ?? "unknown"}</span>
            </>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>disabled</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function RelayTab() {
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<RelayKind | "">("");
  const [status, setStatus] = useState<RelayRequestStatus | "">("");
  const [chain, setChain] = useState("");
  const [systemOnly, setSystemOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setReloadKey((k) => k + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminRelayRequests(
        {
          limit: ADMIN_PAGE_SIZE,
          offset,
          kind: kind || undefined,
          status: status || undefined,
          chainId: chain ? Number(chain) : undefined,
          system: systemOnly ? "true" : undefined,
        },
        signal,
      ),
    [offset, kind, status, chain, systemOnly],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Relay</h2>
      <RelayerStatusStrip reloadKey={reloadKey} />
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          className="input-field"
          style={{ width: "140px" }}
          value={kind}
          onChange={(e) => {
            setKind(KINDS.find((k) => k === e.target.value) ?? "");
            setOffset(0);
          }}
          aria-label="Filter by kind"
        >
          <option value="">all kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select
          className="input-field"
          style={{ width: "150px" }}
          value={status}
          onChange={(e) => {
            setStatus(STATUSES.find((s) => s === e.target.value) ?? "");
            setOffset(0);
          }}
          aria-label="Filter by status"
        >
          <option value="">all statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="input-field"
          style={{ width: "180px" }}
          value={chain}
          onChange={(e) => {
            setChain(CHAINS.map(String).find((c) => c === e.target.value) ?? "");
            setOffset(0);
          }}
          aria-label="Filter by network"
        >
          <option value="">all networks</option>
          {CHAINS.map((c) => (
            <option key={c} value={String(c)}>{chainName(c)}</option>
          ))}
        </select>
        <label style={{ fontSize: "13px", display: "flex", gap: "6px", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={systemOnly}
            onChange={(e) => {
              setSystemOnly(e.target.checked);
              setOffset(0);
            }}
          />
          Automatic executions only
        </label>
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "8px" }}>Auto-refreshes every 30 seconds.</p>
      <div className="glass-card" style={{ padding: "8px" }}>
        <ListState loading={loading && page === null} error={error} empty={items.length === 0} emptyText="No relay requests." />
        {items.map((r) => {
          const txUrl = r.txHash ? explorerTxUrl(r.chainId, r.txHash) : null;
          const errText = [r.errorCode, r.errorMessage].filter((v): v is string => Boolean(v)).join(": ");
          return (
            <div key={r.id} style={{ ...ROW_STYLE, gridTemplateColumns: COLUMNS }}>
              <span style={{ color: "var(--text-secondary)" }}>{new Date(r.createdAt).toLocaleString()}</span>
              <span>{r.kind}</span>
              <span>{chainName(r.chainId)}</span>
              <span title={r.projectId}>
                <Link href={`/projects/${encodeURIComponent(r.projectId)}`} style={{ color: "var(--brand-accent)" }}>
                  {shortAddr(r.projectId.split(":")[1] ?? r.projectId)}
                </Link>
              </span>
              <span title={r.account}>{shortAddr(r.account)}</span>
              <span><span className={`badge ${requestBadge(r.status)}`}>{r.status}</span></span>
              <span style={{ wordBreak: "break-word" }} title={errText || undefined}>{errText ? truncate(errText, 60) : "-"}</span>
              <span title={r.txHash ?? undefined}>
                {r.txHash && txUrl ? (
                  <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>
                    {shortAddr(r.txHash)}
                  </a>
                ) : (
                  "-"
                )}
              </span>
            </div>
          );
        })}
      </div>
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
    </section>
  );
}
