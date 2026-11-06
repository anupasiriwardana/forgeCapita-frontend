"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  describeApiError,
  fetchMyApplication,
  submitApplication,
  type ApplicationDto,
  type ApplicationInput,
} from "@/lib/api";

const HTTPS_URL = /^https:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/;
const REPO_HOST = /^https:\/\/(?:www\.)?(?:github\.com|gitlab\.com)(?:[/?#]\S*)?$/i;

function SafeLink({ href }: { href: string }) {
  if (!href.startsWith("https://")) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)", wordBreak: "break-all" }}>
      {href}
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "14px" }}>{children}</div>
    </div>
  );
}

function StatusCard({ app }: { app: ApplicationDto }) {
  const badge =
    app.status === "approved" ? "badge-active" : app.status === "pending" ? "badge-pending" : "badge-inactive";
  return (
    <div className="glass-card" style={{ padding: "24px", marginBottom: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "20px" }}>{app.projectName}</h2>
        <span className={`badge ${badge}`}>{app.status}</span>
      </div>
      <Row label="Submitted">{new Date(app.createdAt).toLocaleString()}</Row>
      {app.kycVerifiedAt && <Row label="KYC">KYC verified</Row>}
      {app.reviewNote && <Row label="Review note">{app.reviewNote}</Row>}
      <Row label="Website"><SafeLink href={app.websiteUrl} /></Row>
      <Row label="Pitch deck"><SafeLink href={app.pitchDeckUrl} /></Row>
      {app.repoUrl && <Row label="Repository"><SafeLink href={app.repoUrl} /></Row>}
    </div>
  );
}

const EMPTY_FORM = { projectName: "", summary: "", websiteUrl: "", pitchDeckUrl: "", repoUrl: "", contact: "" };
type FormState = typeof EMPTY_FORM;

function validate(f: FormState): string | null {
  const name = f.projectName.trim();
  const summary = f.summary.trim();
  if (name.length < 1 || name.length > 80) return "Project name must be 1-80 characters";
  if (summary.length < 1 || summary.length > 1000) return "Summary must be 1-1000 characters";
  for (const [label, value] of [["Website URL", f.websiteUrl.trim()], ["Pitch deck URL", f.pitchDeckUrl.trim()]]) {
    if (!value || value.length > 300 || !HTTPS_URL.test(value)) return `${label} must be an https URL (max 300 characters)`;
  }
  const repo = f.repoUrl.trim();
  if (repo && (repo.length > 300 || !REPO_HOST.test(repo))) return "Repository URL must be an https github.com or gitlab.com URL";
  if (f.contact.trim().length > 200) return "Contact must be at most 200 characters";
  return null;
}

export default function ApplyPage() {
  const { user, role, loading, signIn } = useAuth();
  const [application, setApplication] = useState<ApplicationDto | null>(null);
  const [fetched, setFetched] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);

  const canApply = user !== null && (role === "investor" || role === "founder");
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !canApply) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchMyApplication(signal)
      .then((found) => {
        if (signal.aborted) return;
        setApplication(found);
        setLoadError("");
        setFetched(true);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setLoadError(describeApiError(err, "Failed to load your application"));
        setFetched(true);
      });
    return () => controller.abort();
  }, [userId, canApply, reloadKey]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (sending) return;
      const problem = validate(form);
      if (problem) {
        setFormError(problem);
        return;
      }
      setFormError("");
      setSending(true);
      const body: ApplicationInput = {
        projectName: form.projectName.trim(),
        summary: form.summary.trim(),
        websiteUrl: form.websiteUrl.trim(),
        pitchDeckUrl: form.pitchDeckUrl.trim(),
        repoUrl: form.repoUrl.trim(),
        contact: form.contact.trim(),
      };
      try {
        await submitApplication(body);
        setForm(EMPTY_FORM);
        setFetched(false);
        setReloadKey((k) => k + 1);
      } catch (err) {
        setFormError(describeApiError(err, "Could not submit the application"));
      } finally {
        setSending(false);
      }
    },
    [form, sending],
  );

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  let content: React.ReactNode;
  if (loading) {
    content = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else if (!user) {
    content = (
      <div className="alert alert-warning" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span>Please sign in to apply as a founder.</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>
          Sign in
        </button>
      </div>
    );
  } else if (role === "staff" || role === "admin") {
    content = (
      <div className="alert alert-warning">
        Applications are for investors and founders. Review them in <Link href="/admin">Admin</Link>.
      </div>
    );
  } else if (!fetched) {
    content = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else {
    const showForm = !loadError && (application === null || application.status === "rejected");
    content = (
      <>
        {loadError && <div role="alert" className="alert alert-error" style={{ marginBottom: "16px" }}>{loadError}</div>}
        {application && <StatusCard app={application} />}
        {application?.status === "approved" && (
          <div className="alert alert-success">You are an approved founder.</div>
        )}
        {application?.status === "pending" && (
          <div className="alert alert-warning">Your application is pending review.</div>
        )}
        {showForm && (
          <form onSubmit={(e) => void onSubmit(e)} className="glass-card" style={{ padding: "24px", display: "grid", gap: "16px" }}>
            {application?.status === "rejected" && (
              <div className="alert alert-warning">Your application was rejected. You may re-apply.</div>
            )}
            <div>
              <label className="label" htmlFor="projectName">Project name</label>
              <input id="projectName" className="input-field" maxLength={80} value={form.projectName} onChange={set("projectName")} required />
            </div>
            <div>
              <label className="label" htmlFor="summary">Summary</label>
              <textarea id="summary" className="input-field" rows={5} maxLength={1000} value={form.summary} onChange={set("summary")} required />
            </div>
            <div>
              <label className="label" htmlFor="websiteUrl">Website URL</label>
              <input id="websiteUrl" className="input-field" type="url" maxLength={300} placeholder="https://" value={form.websiteUrl} onChange={set("websiteUrl")} required />
            </div>
            <div>
              <label className="label" htmlFor="pitchDeckUrl">Pitch deck URL</label>
              <input id="pitchDeckUrl" className="input-field" type="url" maxLength={300} placeholder="https://" value={form.pitchDeckUrl} onChange={set("pitchDeckUrl")} required />
            </div>
            <div>
              <label className="label" htmlFor="repoUrl">Repository URL (optional)</label>
              <input id="repoUrl" className="input-field" type="url" maxLength={300} placeholder="https://github.com/..." value={form.repoUrl} onChange={set("repoUrl")} />
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>github.com or gitlab.com</div>
            </div>
            <div>
              <label className="label" htmlFor="contact">Contact (optional)</label>
              <input id="contact" className="input-field" maxLength={200} value={form.contact} onChange={set("contact")} />
            </div>
            {formError && <div role="alert" className="alert alert-error">{formError}</div>}
            <button type="submit" className="btn-primary" disabled={sending}>
              {sending ? "Submitting…" : "Submit application"}
            </button>
          </form>
        )}
      </>
    );
  }

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Apply as a founder</h1>
      {content}
    </div>
  );
}
