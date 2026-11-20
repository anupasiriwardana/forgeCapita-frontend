"use client";

import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { toast } from "@/lib/toast";
import {
  ApiError,
  describeFounderError,
  fetchOwnRepos,
  provisionRepo,
  type OwnRepoDto,
  type RepoStatus,
} from "@/lib/api";

const REPO_TONE: Record<RepoStatus, StatusTone> = {
  active: "success",
  invited: "warning",
  failed: "danger",
  revoked: "neutral",
};

const GITHUB_LOGIN_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const MIN_PROJECT_NAME = 3;
const MAX_PROJECT_NAME = 60;

function repoErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return "Repository provisioning is not available right now. Try again later.";
    if (err.status === 409) return "A repository request already exists for a different GitHub user.";
    if (err.status === 422) return "GitHub user not found. Check the username.";
  }
  return describeFounderError(err, "Could not request the repository");
}

function RepoDetails({ repo }: { repo: OwnRepoDto }) {
  return (
    <div className="kv-list">
      <div className="kv-row"><span>GitHub user</span><span className="mono">{repo.founderLogin}</span></div>
      <div className="kv-row"><span>Requested</span><span className="num">{new Date(repo.createdAt).toLocaleString()}</span></div>
      <div className="kv-row">
        <span>Project</span>
        <span>{repo.projectId !== null ? `Linked to project ${repo.projectName ?? repo.projectId}` : "Not used yet"}</span>
      </div>
    </div>
  );
}

function RepoTitle({ repo }: { repo: OwnRepoDto }) {
  const safeLink = repo.htmlUrl.startsWith("https://");
  return (
    <span className="panel-title">
      <FolderGit2 size={16} aria-hidden="true" />
      {safeLink ? (
        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="link-accent mono">
          {repo.fullName}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="mono">{repo.fullName}</span>
      )}
    </span>
  );
}

export function RepoSection() {
  const [repos, setRepos] = useState<OwnRepoDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [login, setLogin] = useState("");
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh(): Promise<void> {
    try {
      setRepos(await fetchOwnRepos());
      setLoadError("");
    } catch (err) {
      setLoadError(describeFounderError(err, "Failed to load repositories"));
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchOwnRepos(signal)
      .then((items) => {
        if (!signal.aborted) setRepos(items);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setLoadError(describeFounderError(err, "Failed to load repositories"));
      })
      .finally(() => {
        if (!signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const trimmedName = projectName.trim();
  const nameValid = trimmedName.length >= MIN_PROJECT_NAME && trimmedName.length <= MAX_PROJECT_NAME && /[A-Za-z0-9]/.test(trimmedName);
  const trimmedLogin = login.trim();
  const loginValid = GITHUB_LOGIN_REGEX.test(trimmedLogin);
  const hasUnlinked = repos.some((r) => r.projectId === null);
  const hasFailedUnlinked = repos.some((r) => r.status === "failed" && r.projectId === null);

  async function submit(githubUsername: string): Promise<void> {
    if (busy || !nameValid) return;
    setBusy(true);
    setError("");
    try {
      await provisionRepo({ githubUsername, projectName: trimmedName });
      toast.success("Repository requested", { description: "Accept the invite in your GitHub notifications or email." });
      await refresh();
    } catch (err) {
      const message = repoErrorMessage(err);
      setError(message);
      toast.error(message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const nameInput = (
    <Field
      label="Project name"
      id="repoProjectName"
      error={projectName !== "" && !nameValid ? "Use 3 to 60 characters including at least one letter or digit" : undefined}
    >
      <Input value={projectName} maxLength={MAX_PROJECT_NAME} onChange={(e) => setProjectName(e.target.value)} />
    </Field>
  );

  const errorBox = error && <InlineAlert tone="danger">{error}</InlineAlert>;
  const requestForm = (
    <Card>
      <CardHeader
        title="Request a repository"
        subtitle="ForgeCapita creates the repository and invites your GitHub account."
      />
      <CardBody className="stack-md content-narrow">
        {repos.length > 0 && <p className="panel-note">Your repository is linked; you can request another for your next project</p>}
        <p className="panel-note">You need a free GitHub account; create one first if you have none</p>
        <Field
          label="GitHub username"
          id="repoGithubUser"
          error={trimmedLogin !== "" && !loginValid ? "Enter a valid GitHub username" : undefined}
        >
          <Input value={login} maxLength={39} autoComplete="off" onChange={(e) => setLogin(e.target.value)} />
        </Field>
        {nameInput}
        {errorBox}
        <div>
          <Button loading={busy} disabled={!loginValid || !nameValid} onClick={() => void submit(trimmedLogin)}>
            {busy ? "Requesting…" : "Request repository"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  let body: React.ReactNode;
  if (!loaded) {
    body = (
      <Card aria-busy="true">
        <CardBody className="stack-md">
          <span className="sr-only" role="status">Loading…</span>
          <Skeleton width="40%" height={16} />
          <Skeleton width="70%" />
          <Skeleton width="55%" />
        </CardBody>
      </Card>
    );
  } else if (loadError && repos.length === 0) {
    body = (
      <Card>
        <ErrorState title="Could not load repositories" message={loadError} onRetry={() => void refresh()} />
      </Card>
    );
  } else {
    body = (
      <>
        {repos.map((repo) => (
          <Card key={repo.id}>
            <CardHeader as="h2" title={<RepoTitle repo={repo} />} actions={<StatusPill tone={REPO_TONE[repo.status]}>{repo.status}</StatusPill>} />
            <CardBody className="stack-md">
              <RepoDetails repo={repo} />
              {repo.status === "invited" && repo.projectId === null && (
                <InlineAlert tone="info">Accept the invite in your GitHub notifications or email</InlineAlert>
              )}
              {repo.status === "revoked" && repo.projectId === null && (
                <InlineAlert tone="warning">Access to this repository was revoked. Contact support.</InlineAlert>
              )}
              {repo.status === "failed" && repo.projectId === null && (
                <>
                  <InlineAlert tone="danger">The invite failed. The repository check stays unmet until a retry succeeds.</InlineAlert>
                  <div className="content-narrow">{nameInput}</div>
                  {errorBox}
                  <div>
                    <Button loading={busy} disabled={!nameValid} onClick={() => void submit(repo.founderLogin)}>
                      {busy ? "Retrying…" : "Retry invite"}
                    </Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        ))}
        {!hasUnlinked && requestForm}
        {hasUnlinked && !hasFailedUnlinked && errorBox}
      </>
    );
  }

  return (
    <section id="repo" className="section-stack">
      {body}
    </section>
  );
}
