"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS, complaintBadge } from "@/components/ComplaintDialog";
import { useAuth } from "@/components/web3/AuthProvider";
import { describeApiError, listMyComplaints, shortAddr, type ComplaintDto } from "@/lib/api";
import { chainName } from "@/config/chains";

/** Signed-in only list of the caller's own complaints, including the review team's response. */
export function MyComplaints() {
  const { user } = useAuth();
  const [items, setItems] = useState<ComplaintDto[] | null>(null);
  const [error, setError] = useState("");
  const signedIn = user !== null;

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    const { signal } = controller;
    listMyComplaints(signal)
      .then((list) => {
        if (!signal.aborted) setItems(list);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load complaints"));
      });
    return () => controller.abort();
  }, [signedIn]);

  if (!signedIn) return null;

  return (
    <section style={{ marginTop: "40px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>My complaints</h2>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {!error && items === null && <p style={{ color: "var(--text-muted)" }}>Loading complaints…</p>}
      {!error && items !== null && items.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No complaints filed.</p>
      )}
      {!error && items !== null && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((c) => (
            <div key={c.id} className="glass-card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <strong>{CATEGORY_LABELS[c.category]}</strong>
                <span className={`badge ${complaintBadge(c.status)}`}>{c.status}</span>
              </div>
              <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <span>{chainName(c.chainId)}</span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
                <Link href={`/projects/${encodeURIComponent(c.projectId)}`}>
                  {shortAddr(c.projectId.split(":")[1] ?? c.projectId)}
                </Link>
              </div>
              {c.staffNote && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.1))", fontSize: "13px" }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>Response from the review team</div>
                  <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, color: "var(--text-secondary)" }}>
                    {c.staffNote}
                  </p>
                  <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>
                    Status {c.status}, updated {new Date(c.updatedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
