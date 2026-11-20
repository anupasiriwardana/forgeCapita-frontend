"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { toast } from "@/lib/toast";
import { useAuth } from "@/components/web3/AuthProvider";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
import {
  createComplaint,
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

  const trimmedBody = body.trim();
  const trimmedEvidence = evidence.trim();
  const bodyOk = trimmedBody.length >= BODY_MIN && trimmedBody.length <= BODY_MAX;
  const evidenceOk = validEvidenceUrl(trimmedEvidence);
  const bodyError = trimmedBody.length > 0 && trimmedBody.length < BODY_MIN ? `At least ${BODY_MIN} characters.` : undefined;

  /** Throws on failure so the dialog shows the mapped API error inline and stays open. */
  const submit = async (): Promise<void> => {
    if (!bodyOk || !evidenceOk) return;
    await createComplaint({
      projectId,
      category,
      body: trimmedBody,
      evidenceUrl: trimmedEvidence || undefined,
    });
    onClose(true);
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose(false);
      }}
      title="Report a problem"
      body="Only you and ForgeCapita staff can see this report. The founder is not shown who filed it."
      confirmLabel="Submit"
      confirmDisabled={!bodyOk || !evidenceOk}
      onConfirm={submit}
      errorFallback="Could not submit the complaint"
    >
      <Field label="Category">
        <Select value={category} onChange={(e) => setCategory(CATEGORIES.find((c) => c === e.target.value) ?? "OTHER")}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </Select>
      </Field>
      <Field
        label={`What happened? (${BODY_MIN}-${BODY_MAX} characters)`}
        hint={
          <span className="num">
            {trimmedBody.length} / {BODY_MAX}
            {trimmedBody.length < BODY_MIN ? ` (at least ${BODY_MIN})` : ""}
          </span>
        }
        error={bodyError}
      >
        <Textarea rows={5} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Evidence link (optional, https only)" error={evidenceOk ? undefined : "Enter a valid https link."}>
        <Input type="url" maxLength={URL_MAX} placeholder="https://" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
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
      <div className="ui-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Flag size={16} aria-hidden="true" style={{ color: "var(--text-2)", flexShrink: 0 }} />
        <p className="panel-note" style={{ flex: 1, minWidth: 200 }}>Sign in to report a problem with this project.</p>
        <Button variant="secondary" size="sm" onClick={() => void signIn()}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="ui-card stack-md" style={{ padding: "16px 20px" }}>
      <ProfileRequiredNotice />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Flag size={16} aria-hidden="true" style={{ color: "var(--text-2)", flexShrink: 0 }} />
        <p className="panel-note" style={{ flex: 1, minWidth: 200 }}>
          Something wrong with this project? Reports are private to you and ForgeCapita staff.
        </p>
        <Button variant="secondary" size="sm" disabled={!writeAllowed} onClick={() => { setFiled(false); setOpen(true); }}>
          Report a problem
        </Button>
      </div>
      {filed && (
        <p role="status" className="panel-note">
          Report submitted. You can follow it under <Link href="/portfolio#my-complaints">My complaints</Link> on your portfolio.
        </p>
      )}
      {open && (
        <ComplaintForm
          projectId={projectId}
          onClose={(done) => {
            setOpen(false);
            if (done) {
              setFiled(true);
              toast.success("Report submitted.");
            }
          }}
        />
      )}
    </div>
  );
}
