"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  describeFounderError,
  fetchOwnRepos,
  provisionRepo,
  type OwnRepoDto,
} from "@/lib/api";

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

function RepoCard({ repo }: { repo: OwnRepoDto }) {
  const safeLink = repo.htmlUrl.startsWith("https://");
  const badge = repo.status === "active" ? "badge-active" : repo.status === "invited" ? "badge-pending" : "badge-inactive";
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", fontSize: "14px" }}>
      {safeLink ? (
        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>
          {repo.fullName}
        </a>
      ) : (
        <span>{repo.fullName}</span>
      )}
      <span className={`badge ${badge}`}>{repo.status}</span>
      <span>GitHub user: {repo.founderLogin}</span>
      <span style={{ color: "var(--text-secondary)" }}>{new Date(repo.createdAt).toLocaleString()}</span>
      <span style={{ color: "var(--text-secondary)" }}>
        {repo.projectId !== null ? `Linked to project ${repo.projectName ?? repo.projectId}` : "Not used yet"}
      </span>
    </div>
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
      await refresh();
    } catch (err) {
      setError(repoErrorMessage(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const nameInput = (
    <div style={{ marginTop: "12px" }}>
      <label className="label" htmlFor="repoProjectName">Project name</label>
      <input
        id="repoProjectName"
        className="input-field"
        value={projectName}
        maxLength={MAX_PROJECT_NAME}
        onChange={(e) => setProjectName(e.target.value)}
      />
      {projectName !== "" && !nameValid && (
        <p style={{ fontSize: "12px", color: "var(--rose)", marginTop: "4px" }}>
          Use 3 to 60 characters including at least one letter or digit
        </p>
      )}
    </div>
  );

  const errorBox = error && <div role="alert" className="alert alert-error" style={{ marginTop: "12px" }}>{error}</div>;
  const requestForm = (
    <>
      {repos.length > 0 && (
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
          Your repository is linked; you can request another for your next project
        </p>
      )}
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
        You need a free GitHub account; create one first if you have none
      </p>
      <label className="label" htmlFor="repoGithubUser">GitHub username</label>
      <input
        id="repoGithubUser"
        className="input-field"
        value={login}
        maxLength={39}
        onChange={(e) => setLogin(e.target.value)}
      />
      {trimmedLogin !== "" && !loginValid && (
        <p style={{ fontSize: "12px", color: "var(--rose)", marginTop: "4px" }}>Enter a valid GitHub username</p>
      )}
      {nameInput}
      {errorBox}
      <button
        type="button"
        className="btn-primary"
        style={{ marginTop: "12px" }}
        disabled={busy || !loginValid || !nameValid}
        onClick={() => void submit(trimmedLogin)}
      >
        {busy ? "Requesting…" : "Request repository"}
      </button>
    </>
  );

  let body: React.ReactNode;
  if (!loaded) {
    body = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else if (loadError && repos.length === 0) {
    body = <div role="alert" className="alert alert-error">{loadError}</div>;
  } else {
    body = (
      <>
        {repos.map((repo) => (
          <div key={repo.id} style={{ marginBottom: "16px" }}>
            <RepoCard repo={repo} />
            {repo.status === "invited" && repo.projectId === null && (
              <p style={{ marginTop: "12px", color: "var(--text-secondary)" }}>
                Accept the invite in your GitHub notifications or email
              </p>
            )}
            {repo.status === "revoked" && repo.projectId === null && (
              <p style={{ marginTop: "12px", color: "var(--text-secondary)" }}>
                Access to this repository was revoked. Contact support.
              </p>
            )}
            {repo.status === "failed" && repo.projectId === null && (
              <>
                <p style={{ marginTop: "12px", color: "var(--text-secondary)" }}>
                  The invite failed. The repository check stays unmet until a retry succeeds.
                </p>
                {nameInput}
                {errorBox}
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: "12px" }}
                  disabled={busy || !nameValid}
                  onClick={() => void submit(repo.founderLogin)}
                >
                  {busy ? "Retrying…" : "Retry invite"}
                </button>
              </>
            )}
          </div>
        ))}
        {!hasUnlinked && requestForm}
        {hasUnlinked && !hasFailedUnlinked && errorBox}
      </>
    );
  }

  return (
    <section id="repo" className="glass-card" style={{ padding: "24px" }}>
      {body}
    </section>
  );
}
