"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { chainName } from "@/config/chains";
import { formatNative, listAdminCompliance, shortAddr, type ComplianceState } from "@/lib/api";
import { complianceBadge, formatBps } from "@/components/TransparencyPanel";
import { ADMIN_PAGE_SIZE, AdminPager, ListState, ROW_STYLE, useAdminList } from "./shared";

const STATES: ComplianceState[] = ["OK", "WARNED", "ESCALATED", "RESOLVED", "SHUTDOWN"];
const CHAINS = [421614, 97];
const COLUMNS = "1.3fr 1fr 0.9fr 1.8fr 0.8fr 1.2fr 1.6fr";

function shortProject(projectId: string): string {
  const [chain, escrow] = projectId.split(":");
  return escrow ? `${chain}:${shortAddr(escrow)}` : projectId;
}

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "-";
}

export function ComplianceTab() {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<ComplianceState | "">("");
  const [chain, setChain] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminCompliance(
        {
          limit: ADMIN_PAGE_SIZE,
          offset,
          state: state || undefined,
          chainId: chain ? Number(chain) : undefined,
        },
        signal,
      ),
    [offset, state, chain],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Compliance</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
        Revenue audit cases comparing observed inflows with revenue routed to the protocol.
      </p>
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ width: "160px" }}
          value={state}
          onChange={(e) => {
            setState(STATES.find((s) => s === e.target.value) ?? "");
            setOffset(0);
          }}
          aria-label="Filter by state"
        >
          <option value="">all states</option>
          {STATES.map((s) => (
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
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      <div className="glass-card" style={{ padding: "8px" }}>
        <ListState loading={loading} error={error} empty={items.length === 0} emptyText="No compliance cases." />
        {items.map((c) => (
          <div key={c.id} style={{ ...ROW_STYLE, gridTemplateColumns: COLUMNS }}>
            <span title={c.projectId}>
              <Link href={`/projects/${encodeURIComponent(c.projectId)}`} style={{ color: "var(--brand-accent)" }}>
                {shortProject(c.projectId)}
              </Link>
            </span>
            <span>{chainName(c.chainId)}</span>
            <span><span className={`badge ${complianceBadge(c.state)}`}>{c.state}</span></span>
            <span>
              {c.observedNative != null && c.routedNative != null
                ? `${formatNative(c.observedNative, c.chainId)} / ${formatNative(c.routedNative, c.chainId)}`
                : "-"}
            </span>
            <span>{c.shortfallBps != null ? formatBps(c.shortfallBps) : "-"}</span>
            <span style={{ color: "var(--text-secondary)" }}>{fmtTime(c.lastCheckedAt)}</span>
            <span style={{ color: "var(--text-secondary)", wordBreak: "break-word" }}>
              {fmtTime(c.windowStart)} to {fmtTime(c.windowEnd)}
              {c.resolutionNote ? ` - ${c.resolutionNote}` : ""}
            </span>
          </div>
        ))}
      </div>
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
    </section>
  );
}
