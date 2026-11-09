"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { chainName } from "@/config/chains";
import { listAdminLaunchDrafts, shortAddr, type LaunchDraftStatus } from "@/lib/api";
import { ADMIN_PAGE_SIZE, AdminPager, ListState, ROW_STYLE, useAdminList } from "./shared";

const STATUSES: LaunchDraftStatus[] = ["pending", "attached", "applied", "cancelled", "expired", "conflict"];
const CHAINS = [421614, 97];
const COLUMNS = "1.4fr 1.4fr 1fr 1.2fr 0.9fr 1.2fr 1.4fr";

function draftBadge(status: LaunchDraftStatus): string {
  if (status === "applied") return "badge-active";
  if (status === "pending" || status === "attached") return "badge-pending";
  return "badge-inactive";
}

export function LaunchDraftsTab() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<LaunchDraftStatus | "">("");
  const [chain, setChain] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminLaunchDrafts(
        {
          limit: ADMIN_PAGE_SIZE,
          offset,
          status: status || undefined,
          chainId: chain ? Number(chain) : undefined,
        },
        signal,
      ),
    [offset, status, chain],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Launch drafts</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
        Pending drafts hold the founder&apos;s shadow wallet until cancelled or confirmed.
      </p>
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ width: "160px" }}
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
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      <div className="glass-card" style={{ padding: "8px" }}>
        <ListState loading={loading} error={error} empty={items.length === 0} emptyText="No launch drafts." />
        {items.map((d) => (
          <div key={d.id} style={{ ...ROW_STYLE, gridTemplateColumns: COLUMNS }}>
            <span style={{ color: "var(--text-secondary)" }}>{new Date(d.createdAt).toLocaleString()}</span>
            <span style={{ wordBreak: "break-word" }}>{d.name}</span>
            <span title={d.walletAddress}>{shortAddr(d.walletAddress)}</span>
            <span>{chainName(d.chainId)}</span>
            <span><span className={`badge ${draftBadge(d.status)}`}>{d.status}</span></span>
            <span title={d.projectId ?? undefined}>
              {d.projectId ? (
                <Link href={`/projects/${encodeURIComponent(d.projectId)}`} style={{ color: "var(--brand-accent)" }}>
                  {d.escrowAddress ? shortAddr(d.escrowAddress) : "project"}
                </Link>
              ) : (
                "-"
              )}
            </span>
            <span style={{ color: "var(--text-secondary)" }}>{d.appliedAt ? new Date(d.appliedAt).toLocaleString() : "-"}</span>
          </div>
        ))}
      </div>
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
    </section>
  );
}
