"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ApiError,
  describeApiError,
  handoverTakeoverRepo,
  revokeRepoAccess,
  type TakeoverCaseDto,
  type UserRole,
} from "@/lib/api";

const GITHUB_LOGIN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;

type Action = "handover" | "revoke";

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) return "GitHub provisioning is not configured";
  return describeApiError(err);
}

/**
 * Admin step after the new developer accepted on chain: share the project repository with them
 * (write access) and remove the previous developer's access. Both actions are separate on purpose.
 */
export function TakeoverHandover({ c, role, onChanged }: { c: TakeoverCaseDto; role: UserRole; onChanged: () => void }) {
  const [edited, setEdited] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (c.execution?.state !== "accepted") return null;

  const isAdmin = role === "admin";
  const repo = c.repo ?? null;
  const handover = c.handover ?? null;
  const login = (edited ?? handover?.githubLogin ?? c.suggestedGithubLogin ?? "").trim();
  const loginValid = GITHUB_LOGIN.test(login);

  async function run(action: Action): Promise<void> {
    if (busy || !repo) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "handover") {
        const result = await handoverTakeoverRepo(c.id, login);
        setNotice(result.handover.status === "active" ? "Active" : "Invited. They must accept the invitation on GitHub");
      } else {
        await revokeRepoAccess(repo.id);
        setNotice("Revoked");
      }
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <h4 style={{ fontSize: "14px", marginBottom: "6px" }}>Repository handover</h4>
      {repo === null ? (
        <p style={{ fontSize: "13px" }}>No repository is linked to this project</p>
      ) : (
        <>
          <p style={{ fontSize: "13px" }}>
            {isHttps(repo.htmlUrl) ? (
              <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>
                {repo.fullName}
              </a>
            ) : (
              repo.fullName
            )}{" "}
            ({repo.status}, previous developer: {repo.founderLogin})
          </p>
          {handover && (
            <p style={{ fontSize: "13px" }}>
              Handed over to {handover.githubLogin}: {handover.status}
            </p>
          )}
          {isAdmin ? (
            <>
              <label style={{ display: "block", fontSize: "13px", marginBottom: "6px" }}>
                New developer&apos;s GitHub login
                <input
                  type="text"
                  value={edited ?? handover?.githubLogin ?? c.suggestedGithubLogin ?? ""}
                  onChange={(e) => setEdited(e.target.value)}
                  maxLength={39}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy || handover?.status === "active"}
                  style={{ display: "block", marginTop: "4px" }}
                />
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {handover?.status !== "active" && (
                  <button type="button" className="btn-primary" disabled={busy || !loginValid} onClick={() => setPending("handover")}>
                    {handover?.status === "invited" ? "Re-check / resend invitation" : "Hand over repository"}
                  </button>
                )}
                {repo.status !== "revoked" && (
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => setPending("revoke")}>
                    Remove previous developer&apos;s access
                  </button>
                )}
              </div>
              {login !== "" && !loginValid && <p style={{ ...MUTED, margin: "6px 0 0" }}>Not a valid GitHub login</p>}
            </>
          ) : (
            <p style={MUTED}>Only an admin can change repository access.</p>
          )}
        </>
      )}
      {notice && <div role="status" className="alert alert-success" style={{ marginTop: "10px" }}>{notice}</div>}
      {error && <div role="alert" className="alert alert-error" style={{ marginTop: "10px" }}>{error}</div>}
      <ConfirmDialog
        open={pending !== null && repo !== null}
        title={pending === "revoke" ? "Remove the previous developer's access?" : "Hand over the repository?"}
        confirmLabel={pending === "revoke" ? "Remove access" : "Hand over"}
        tone={pending === "revoke" ? "danger" : "default"}
        busy={busy}
        onConfirm={() => pending && void run(pending)}
        onCancel={() => setPending(null)}
      >
        {pending === "handover" && repo && (
          <p>
            This adds {login} as a collaborator with write access to {repo.fullName}; GitHub sends an invitation they must
            accept.
          </p>
        )}
        {pending === "revoke" && repo && (
          <>
            <p>
              This removes the GitHub user {repo.founderLogin} from {repo.fullName} and cancels any pending invite.
            </p>
            {handover === null && (
              <p>Hand over to the new developer first, otherwise nobody new has access.</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
