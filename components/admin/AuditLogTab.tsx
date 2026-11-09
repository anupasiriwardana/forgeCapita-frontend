"use client";

import { useCallback, useState } from "react";
import { listAuditLog, shortAddr } from "@/lib/api";
import { ADDRESS_REGEX, ADMIN_PAGE_SIZE, AdminPager, ListState, ROW_STYLE, shortId, truncate, useAdminList } from "./shared";

const ACTION_REGEX = /^[a-z_]+(\.[a-z_]+)?$/;
const COLUMNS = "1.4fr 1.4fr 1fr 1.6fr 0.8fr 1fr";

export function AuditLogTab() {
  const [offset, setOffset] = useState(0);
  const [actionInput, setActionInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const action = actionInput.trim();
  const target = targetInput.trim().toLowerCase();
  const actionValid = action === "" || (action.length <= 64 && ACTION_REGEX.test(action));
  const targetValid = target === "" || ADDRESS_REGEX.test(target);
  const valid = actionValid && targetValid;

  const load = useCallback(
    (signal: AbortSignal) =>
      listAuditLog(
        { limit: ADMIN_PAGE_SIZE, offset, action: action || undefined, target: target || undefined },
        signal,
      ),
    [offset, action, target],
  );
  const { page, error, loading } = useAdminList(valid ? load : null, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Audit log</h2>
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          className="input-field"
          style={{ width: "240px" }}
          placeholder="Action (e.g. role.change)"
          maxLength={64}
          value={actionInput}
          onChange={(e) => {
            setActionInput(e.target.value);
            setOffset(0);
          }}
          aria-label="Filter by action"
        />
        <input
          className="input-field"
          style={{ width: "360px", maxWidth: "100%" }}
          placeholder="Target address (0x…)"
          maxLength={42}
          value={targetInput}
          onChange={(e) => {
            setTargetInput(e.target.value);
            setOffset(0);
          }}
          aria-label="Filter by target address"
        />
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {!actionValid && <div role="alert" className="alert alert-warning" style={{ marginBottom: "12px" }}>Action must be lowercase letters and underscores, optionally one dot</div>}
      {!targetValid && <div role="alert" className="alert alert-warning" style={{ marginBottom: "12px" }}>Target must be a full 0x address</div>}
      <div className="glass-card" style={{ padding: "8px" }}>
        <ListState loading={loading} error={error} empty={items.length === 0} emptyText="No audit entries." />
        {items.map((e) => (
          <div key={e.id} style={{ ...ROW_STYLE, gridTemplateColumns: COLUMNS }}>
            <span style={{ color: "var(--text-secondary)" }}>{new Date(e.createdAt).toLocaleString()}</span>
            <span style={{ wordBreak: "break-word" }}>{e.action}</span>
            <span title={e.target ?? undefined}>{e.target ? shortAddr(e.target) : "-"}</span>
            <span style={{ wordBreak: "break-word" }} title={`${e.before ?? ""} -> ${e.after ?? ""}`}>
              {truncate(e.before ?? "-", 24)} → {truncate(e.after ?? "-", 24)}
            </span>
            <span title={e.actorUserId ?? undefined}>{e.actorUserId ? shortId(e.actorUserId) : "-"}</span>
            <span style={{ color: "var(--text-secondary)" }}>{e.ip ?? "-"}</span>
          </div>
        ))}
      </div>
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
    </section>
  );
}
