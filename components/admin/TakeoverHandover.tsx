"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusPill } from "@/components/ui/StatusPill";
import { toast } from "@/lib/toast";
import {
  ApiError,
  describeApiError,
  handoverTakeoverRepo,
  revokeRepoAccess,
  type TakeoverCaseDto,
  type UserRole,
} from "@/lib/api";

const GITHUB_LOGIN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

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
  const [notice, setNotice] = useState("");

  if (c.execution?.state !== "accepted") return null;

  const isAdmin = role === "admin";
  const repo = c.repo ?? null;
  const handover = c.handover ?? null;
  const login = (edited ?? handover?.githubLogin ?? c.suggestedGithubLogin ?? "").trim();
  const loginValid = GITHUB_LOGIN.test(login);

  /** Throws on failure so the confirm dialog shows the (safe) error and stays open. */
  async function run(action: Action): Promise<void> {
    if (!repo) return;
    setNotice("");
    if (action === "handover") {
      const result = await handoverTakeoverRepo(c.id, login);
      setNotice(result.handover.status === "active" ? "Active" : "Invited. They must accept the invitation on GitHub");
      toast.success(result.handover.status === "active" ? "Repository handed over" : "Invitation sent");
    } else {
      await revokeRepoAccess(repo.id);
      setNotice("Revoked");
      toast.success("Previous developer's access removed");
    }
    onChanged();
  }

  return (
    <div className="admin-section">
      <h3 className="admin-section-title">Repository handover</h3>
      {repo === null ? (
        <p className="panel-note">No repository is linked to this project</p>
      ) : (
        <div className="stack-md">
          <p style={{ fontSize: 13 }}>
            {isHttps(repo.htmlUrl) ? (
              <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="link-accent">
                {repo.fullName}
              </a>
            ) : (
              repo.fullName
            )}{" "}
            <StatusPill tone={repo.status === "revoked" ? "neutral" : "info"}>{repo.status}</StatusPill>{" "}
            <span className="admin-muted">previous developer: {repo.founderLogin}</span>
          </p>
          {handover && (
            <p style={{ fontSize: 13 }}>
              Handed over to <span className="mono">{handover.githubLogin}</span>:{" "}
              <StatusPill tone={handover.status === "active" ? "success" : "warning"}>{handover.status}</StatusPill>
            </p>
          )}
          {isAdmin ? (
            <>
              <Field
                label="New developer's GitHub login"
                error={login !== "" && !loginValid ? "Not a valid GitHub login" : undefined}
                className="content-narrow"
              >
                <Input
                  type="text"
                  value={edited ?? handover?.githubLogin ?? c.suggestedGithubLogin ?? ""}
                  onChange={(e) => setEdited(e.target.value)}
                  maxLength={39}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={handover?.status === "active"}
                  style={{ maxWidth: 320 }}
                />
              </Field>
              <div className="admin-actions">
                {handover?.status !== "active" && (
                  <Button disabled={!loginValid} onClick={() => setPending("handover")}>
                    {handover?.status === "invited" ? "Re-check / resend invitation" : "Hand over repository"}
                  </Button>
                )}
                {repo.status !== "revoked" && (
                  <Button variant="danger" onClick={() => setPending("revoke")}>
                    Remove previous developer&apos;s access
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="panel-note">Only an admin can change repository access.</p>
          )}
        </div>
      )}
      {notice && (
        <InlineAlert tone="success" className="admin-section-alert">
          {notice}
        </InlineAlert>
      )}
      <ConfirmDialog
        open={pending !== null && repo !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending === "revoke" ? "Remove the previous developer's access?" : "Hand over the repository?"}
        body={
          pending === "handover" && repo ? (
            <>
              This adds <span className="mono">{login}</span> as a collaborator with write access to {repo.fullName}; GitHub
              sends an invitation they must accept.
            </>
          ) : pending === "revoke" && repo ? (
            <>
              This removes the GitHub user <span className="mono">{repo.founderLogin}</span> from {repo.fullName} and
              cancels any pending invite.
            </>
          ) : (
            ""
          )
        }
        confirmLabel={pending === "revoke" ? "Remove access" : "Hand over"}
        tone={pending === "revoke" ? "danger" : "primary"}
        onConfirm={async () => {
          if (pending) await run(pending);
        }}
        describeError={errorText}
      >
        {pending === "revoke" && repo && handover === null && (
          <InlineAlert tone="warning">Hand over to the new developer first, otherwise nobody new has access.</InlineAlert>
        )}
      </ConfirmDialog>
    </div>
  );
}
