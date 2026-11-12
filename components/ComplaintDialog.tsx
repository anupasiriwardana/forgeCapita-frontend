"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/components/web3/AuthProvider";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
import {
  createComplaint,
  describeApiError,
  type ComplaintCategory,
  type ComplaintStatus,
} from "@/lib/api";

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  MISREPRESENTATION: "Misrepresentation",
  REVENUE_UNDERREPORTING: "Revenue under-reporting",
  INACTIVITY: "Inactivity",
  SECURITY: "Security",
  OTHER: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ComplaintCategory[];

export function complaintBadge(status: ComplaintStatus): string {
  if (status === "RESOLVED") return "badge-active";
  if (status === "INVESTIGATING") return "badge-pending";
  if (status === "DISMISSED") return "badge-inactive";
  return "badge-brand";
}

export const BODY_MIN = 20;
export const BODY_MAX = 2000;
const URL_MAX = 500;

function validEvidenceUrl(value: string): boolean {
  if (value === "") return true;
  if (value.length > URL_MAX) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function ComplaintForm({ projectId, onClose }: { projectId: string; onClose: (filed: boolean) => void }) {
  const [category, setCategory] = useState<ComplaintCategory>("MISREPRESENTATION");
  const [body, setBody] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const categoryId = useId();
  const bodyId = useId();
  const evidenceId = useId();

  const trimmedBody = body.trim();
  const trimmedEvidence = evidence.trim();
  const bodyOk = trimmedBody.length >= BODY_MIN && trimmedBody.length <= BODY_MAX;
  const evidenceOk = validEvidenceUrl(trimmedEvidence);

  const submit = async (): Promise<void> => {
    if (busy || !bodyOk || !evidenceOk) return;
    setBusy(true);
    setError("");
    try {
      await createComplaint({
        projectId,
        category,
        body: trimmedBody,
        evidenceUrl: trimmedEvidence || undefined,
      });
      onClose(true);
    } catch (err) {
      setError(describeApiError(err, "Could not submit the complaint"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title="Report a problem"
      confirmLabel="Submit"
      busy={busy}
      confirmDisabled={!bodyOk || !evidenceOk}
      onConfirm={() => void submit()}
      onCancel={() => onClose(false)}
    >
      <p style={{ marginBottom: "12px" }}>
        Only you and ForgeCapita staff can see this report. The founder is not shown who filed it.
      </p>
      <label htmlFor={categoryId} style={{ display: "block", fontSize: "13px", marginBottom: "6px" }}>Category</label>
      <select
        id={categoryId}
        className="input-field"
        value={category}
        disabled={busy}
        onChange={(e) => setCategory(CATEGORIES.find((c) => c === e.target.value) ?? "OTHER")}
        style={{ marginBottom: "12px" }}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
        ))}
      </select>
      <label htmlFor={bodyId} style={{ display: "block", fontSize: "13px", marginBottom: "6px" }}>
        What happened? ({BODY_MIN}-{BODY_MAX} characters)
      </label>
      <textarea
        id={bodyId}
        className="input-field"
        rows={5}
        maxLength={BODY_MAX}
        value={body}
        disabled={busy}
        onChange={(e) => setBody(e.target.value)}
      />
      <p style={{ fontSize: "12px", color: bodyOk ? "var(--text-muted)" : "var(--rose)", margin: "4px 0 12px" }}>
        {trimmedBody.length} / {BODY_MAX}
        {trimmedBody.length < BODY_MIN ? ` (at least ${BODY_MIN})` : ""}
      </p>
      <label htmlFor={evidenceId} style={{ display: "block", fontSize: "13px", marginBottom: "6px" }}>
        Evidence link (optional, https only)
      </label>
      <input
        id={evidenceId}
        className="input-field"
        type="url"
        maxLength={URL_MAX}
        placeholder="https://"
        value={evidence}
        disabled={busy}
        onChange={(e) => setEvidence(e.target.value)}
      />
      {!evidenceOk && (
        <p style={{ fontSize: "12px", color: "var(--rose)", marginTop: "4px" }}>Enter a valid https link.</p>
      )}
      {error && <p role="alert" style={{ color: "var(--rose)", fontSize: "13px", marginTop: "8px" }}>{error}</p>}
    </ConfirmDialog>
  );
}

/** "Report a problem" entry point for a project page: button when signed in, sign-in hint otherwise. */
export function ReportProblem({ projectId }: { projectId: string }) {
  const { user, signIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [filed, setFiled] = useState(false);
  const { allowed: writeAllowed } = useWriteAllowed();

  if (!user) {
    return (
      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "16px" }}>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>Sign in</button>{" "}
        to report a problem with this project.
      </p>
    );
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <ProfileRequiredNotice />
      <button type="button" className="btn-secondary" disabled={!writeAllowed} onClick={() => { setFiled(false); setOpen(true); }}>
        Report a problem
      </button>
      {filed && (
        <p role="status" style={{ fontSize: "13px", color: "var(--emerald)", marginTop: "8px" }}>
          Report submitted. You can follow it under My complaints on your portfolio.
        </p>
      )}
      {open && (
        <ComplaintForm
          projectId={projectId}
          onClose={(done) => {
            setOpen(false);
            if (done) setFiled(true);
          }}
        />
      )}
    </div>
  );
}
