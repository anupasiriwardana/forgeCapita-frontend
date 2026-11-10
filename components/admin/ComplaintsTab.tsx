"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";
import { CATEGORY_LABELS, complaintBadge } from "@/components/ComplaintDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { chainName } from "@/config/chains";
import {
  ApiError,
  describeApiError,
  listAdminComplaints,
  patchAdminComplaint,
  shortAddr,
  type AdminComplaintDto,
  type ComplaintStatus,
} from "@/lib/api";
import { ADMIN_PAGE_SIZE, AdminPager, ListState, ROW_STYLE, useAdminList } from "./shared";

const STATUSES: ComplaintStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"];
const NOTE_MAX = 1000;
const COLUMNS = "1.5fr 1.3fr 1fr 1.2fr 1.6fr";

interface PendingChange {
  next: ComplaintStatus;
  item: AdminComplaintDto;
}

function nextStatuses(status: ComplaintStatus): ComplaintStatus[] {
  if (status === "OPEN") return ["INVESTIGATING", "RESOLVED", "DISMISSED"];
  if (status === "INVESTIGATING") return ["RESOLVED", "DISMISSED"];
  return [];
}

function noteRequired(status: ComplaintStatus): boolean {
  return status === "RESOLVED" || status === "DISMISSED";
}

export function ComplaintsTab() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<ComplaintStatus | "">("");
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const noteId = useId();

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminComplaints({ limit: ADMIN_PAGE_SIZE, offset, status: status || undefined }, signal),
    [offset, status],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  const openDialog = (next: ComplaintStatus, item: AdminComplaintDto): void => {
    setNote("");
    setActionError("");
    setPending({ next, item });
  };

  const closeDialog = (): void => {
    setPending(null);
    setNote("");
    setActionError("");
  };

  const trimmed = note.trim();
  const needsNote = pending !== null && noteRequired(pending.next);

  const submit = async (): Promise<void> => {
    if (!pending || busy || (needsNote && trimmed === "")) return;
    setBusy(true);
    setActionError("");
    try {
      await patchAdminComplaint(pending.item.id, pending.next, trimmed || undefined);
      closeDialog();
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        closeDialog();
        setReloadKey((k) => k + 1);
        setActionError("Complaint status changed in the meantime; list refreshed");
      } else {
        setActionError(describeApiError(err, "Action failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Complaints</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
        Investor reports about projects. Visible to staff and the reporter only. Notes you add are shown to the reporter.
      </p>
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ width: "180px" }}
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
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      <div className="glass-card" style={{ padding: "8px" }}>
        <ListState loading={loading} error={error} empty={items.length === 0} emptyText="No complaints." />
        {items.map((c) => {
          const expanded = openId === c.id;
          return (
            <div key={c.id}>
              <div style={{ ...ROW_STYLE, gridTemplateColumns: COLUMNS }}>
                <span>{CATEGORY_LABELS[c.category]}</span>
                <span title={c.projectId}>
                  <Link href={`/projects/${encodeURIComponent(c.projectId)}`} style={{ color: "var(--brand-accent)" }}>
                    {c.chainId}:{shortAddr(c.projectId.split(":")[1] ?? c.projectId)}
                  </Link>
                </span>
                <span><span className={`badge ${complaintBadge(c.status)}`}>{c.status}</span></span>
                <span style={{ color: "var(--text-secondary)" }}>{new Date(c.createdAt).toLocaleString()}</span>
                <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-expanded={expanded}
                    onClick={() => setOpenId(expanded ? null : c.id)}
                  >
                    {expanded ? "Hide" : "Details"}
                  </button>
                </span>
              </div>
              {expanded && (
                <div style={{ padding: "12px 16px 16px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ color: "var(--text-secondary)" }}>
                    Reporter <span style={{ fontFamily: "monospace" }} title={c.reporterAddress}>{shortAddr(c.reporterAddress)}</span>
                    {" · "}
                    {chainName(c.chainId)}
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{c.body}</p>
                  {c.evidenceUrl && (
                    <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
                      {c.evidenceUrl}
                    </a>
                  )}
                  {c.staffNote && (
                    <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, color: "var(--text-secondary)" }}>
                      Note shown to reporter: {c.staffNote}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {nextStatuses(c.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={s === "DISMISSED" ? "btn-danger" : "btn-secondary"}
                        onClick={() => openDialog(s, c)}
                      >
                        Mark {s.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
      {pending === null && actionError && (
        <p role="alert" style={{ color: "var(--rose)", fontSize: "13px", marginTop: "12px" }}>{actionError}</p>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pending ? `Mark complaint ${pending.next.toLowerCase()}?` : "Update complaint"}
        confirmLabel="Confirm"
        tone={pending?.next === "DISMISSED" ? "danger" : "default"}
        busy={busy}
        confirmDisabled={needsNote && trimmed === ""}
        onConfirm={() => void submit()}
        onCancel={closeDialog}
      >
        <p style={{ marginBottom: "12px" }}>
          The change is recorded in the audit log. Resolved and dismissed complaints cannot be reopened.
        </p>
        <label htmlFor={noteId} style={{ display: "block", fontSize: "13px", marginBottom: "6px" }}>
          {needsNote ? "Note (required)" : "Note (optional)"}
        </label>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>
          This note is shown to the person who filed the complaint.
        </p>
        <textarea
          id={noteId}
          className="input-field"
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
        />
        {needsNote && trimmed === "" && (
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>A note is required to confirm.</p>
        )}
        {actionError && (
          <p role="alert" style={{ color: "var(--rose)", fontSize: "13px", marginTop: "8px" }}>{actionError}</p>
        )}
      </ConfirmDialog>
    </section>
  );
}
