"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  describeFounderError,
  approveShadowWallet,
  listAdminShadowWallets,
  rejectShadowWallet,
  shortAddr,
  type ShadowWalletStatus,
  type StaffShadowWalletDto,
} from "@/lib/api";
import { ADMIN_PAGE_SIZE as PAGE_SIZE, AdminPager as Pager, badgeClass } from "./shared";

const WALLET_TABS: { key: ShadowWalletStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export function ShadowWalletsTab() {
  const [tab, setTab] = useState<ShadowWalletStatus>("pending");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<StaffShadowWalletDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listAdminShadowWallets(tab, PAGE_SIZE, offset, signal)
      .then((page) => {
        if (signal.aborted) return;
        setItems(page.items);
        setTotal(page.total);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load shadow wallets"));
      });
    return () => controller.abort();
  }, [tab, offset, reloadKey]);

  const review = async (id: string, action: "approve" | "reject") => {
    if (busy) return;
    const note = (notes[id] ?? "").trim();
    if (action === "reject" && !note) {
      setError("A note is required to reject");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (action === "approve") await approveShadowWallet(id, note || undefined);
      else await rejectShadowWallet(id, note);
      setSuccess(action === "approve" ? "Shadow wallet approved" : "Shadow wallet rejected");
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError("You cannot review your own wallet");
      else if (err instanceof ApiError && err.status === 404) setError("Shadow wallet not found, refresh the list");
      else setError(describeFounderError(err, "Review failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: "48px" }}>
      <h1 style={{ fontSize: "22px", marginBottom: "16px" }}>Shadow wallets</h1>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {WALLET_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setTab(t.key);
              setOffset(0);
              setSuccess("");
            }}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      {success && <div role="status" className="alert alert-success" style={{ marginBottom: "12px" }}>{success}</div>}
      <div className="glass-card" style={{ padding: "8px" }}>
        {items.length === 0 && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>No shadow wallets.</p>}
        {items.map((w) => (
          <div key={w.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: "14px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <span title={w.address}>{shortAddr(w.address)}</span>
              <span style={{ color: "var(--text-secondary)" }} title={w.founderWallet}>
                founder {shortAddr(w.founderWallet)}
              </span>
              <span className={`badge ${badgeClass(w.status)}`}>{w.status}</span>
              <span style={{ color: "var(--text-secondary)" }}>{new Date(w.createdAt).toLocaleString()}</span>
            </div>
            {(w.reviewNote || w.reviewedAt) && (
              <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
                {w.reviewNote}
                {w.reviewedAt && ` (reviewed ${new Date(w.reviewedAt).toLocaleString()})`}
              </div>
            )}
            {w.status === "pending" && (
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <input
                  className="input-field"
                  style={{ flex: 1, minWidth: "200px" }}
                  placeholder="Note (required to reject)"
                  maxLength={500}
                  value={notes[w.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  aria-label={`Note for ${w.address}`}
                />
                <button type="button" className="btn-success" disabled={busy} onClick={() => void review(w.id, "approve")}>
                  Approve
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy || !(notes[w.id] ?? "").trim()}
                  onClick={() => void review(w.id, "reject")}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />
    </section>
  );
}
