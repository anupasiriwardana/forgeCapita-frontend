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
const LINKEDIN_URL = /^https:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/[^\s/?#]+\/?(?:[?#]\S*)?$/i;
const GITHUB_URL = /^https:\/\/(?:www\.)?github\.com\/[A-Za-z0-9-]+\/?(?:[?#]\S*)?$/i;
const ABOUT_MIN = 50;
const ABOUT_MAX = 1500;
const MAX_OTHER_LINKS = 3;
const NEED_LINK_MESSAGE = "Add at least one of LinkedIn, GitHub or portfolio";
const HELPER_STYLE = { fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" } as const;

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
        <h2 style={{ fontSize: "20px" }}>{app.projectName ?? "Founder application"}</h2>
        <span className={`badge ${badge}`}>{app.status}</span>
      </div>
      <Row label="Submitted">{new Date(app.createdAt).toLocaleString()}</Row>
      {app.kycVerifiedAt && <Row label="KYC">KYC verified</Row>}
      {app.reviewNote && <Row label="Review note">{app.reviewNote}</Row>}
      {app.about && <Row label="About you"><span style={{ whiteSpace: "pre-wrap" }}>{app.about}</span></Row>}
      {app.linkedinUrl && <Row label="LinkedIn"><SafeLink href={app.linkedinUrl} /></Row>}
      {app.githubUrl && <Row label="GitHub"><SafeLink href={app.githubUrl} /></Row>}
      {app.portfolioUrl && <Row label="Portfolio"><SafeLink href={app.portfolioUrl} /></Row>}
      {app.otherLinks?.map((link) => <Row key={link} label="Other link"><SafeLink href={link} /></Row>)}
      {app.summary && <Row label="Summary"><span style={{ whiteSpace: "pre-wrap" }}>{app.summary}</span></Row>}
      {app.websiteUrl && <Row label="Website"><SafeLink href={app.websiteUrl} /></Row>}
      {app.pitchDeckUrl && <Row label="Pitch deck"><SafeLink href={app.pitchDeckUrl} /></Row>}
      {app.repoUrl && <Row label="Repository"><SafeLink href={app.repoUrl} /></Row>}
    </div>
  );
}

const EMPTY_FORM = {
  about: "",
  resumeUrl: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  otherLinks: [] as string[],
  kycDocsUrl: "",
  kycNote: "",
};
type FormState = typeof EMPTY_FORM;
type TextKey = Exclude<keyof FormState, "otherLinks">;

function isHttps(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && HTTPS_URL.test(value);
}

function validate(f: FormState): string | null {
  const about = f.about.trim();
  if (about.length < ABOUT_MIN || about.length > ABOUT_MAX) return `About you must be ${ABOUT_MIN}-${ABOUT_MAX} characters`;
  if (!isHttps(f.resumeUrl.trim(), 500)) return "Resume link must be an https URL (max 500 characters)";
  const linkedin = f.linkedinUrl.trim();
  const github = f.githubUrl.trim();
  const portfolio = f.portfolioUrl.trim();
  if (!linkedin && !github && !portfolio) return NEED_LINK_MESSAGE;
  if (linkedin && (!isHttps(linkedin, 300) || !LINKEDIN_URL.test(linkedin))) {
    return "LinkedIn must be an https profile URL like https://www.linkedin.com/in/your-name";
  }
  if (github && (!isHttps(github, 300) || !GITHUB_URL.test(github))) {
    return "GitHub must be an https profile URL like https://github.com/your-name (not a repository)";
  }
  if (portfolio && !isHttps(portfolio, 300)) return "Portfolio must be an https URL (max 300 characters)";
  for (const link of f.otherLinks) {
    if (!isHttps(link.trim(), 300)) return "Each other link must be an https URL (max 300 characters)";
  }
  if (!isHttps(f.kycDocsUrl.trim(), 500)) return "KYC documents link must be an https URL (max 500 characters)";
  if (f.kycNote.trim().length > 500) return "Note for reviewer must be at most 500 characters";
  return null;
}

export default function ApplyPage() {
  const { user, role, loading, signIn } = useAuth();
  const [application, setApplication] = useState<ApplicationDto | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | undefined>(undefined);
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
        setFetchedFor(userId);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setLoadError(describeApiError(err, "Failed to load your application"));
        setFetchedFor(userId);
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
        about: form.about.trim(),
        resumeUrl: form.resumeUrl.trim(),
        linkedinUrl: form.linkedinUrl.trim(),
        githubUrl: form.githubUrl.trim(),
        portfolioUrl: form.portfolioUrl.trim(),
        otherLinks: form.otherLinks.map((link) => link.trim()).filter((link) => link !== ""),
        kycDocsUrl: form.kycDocsUrl.trim(),
        kycNote: form.kycNote.trim(),
      };
      try {
        await submitApplication(body);
        setForm(EMPTY_FORM);
        setFetchedFor(undefined);
        setReloadKey((k) => k + 1);
      } catch (err) {
        setFormError(describeApiError(err, "Could not submit the application"));
      } finally {
        setSending(false);
      }
    },
    [form, sending],
  );

  const set = (key: TextKey) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const setOther = (index: number, value: string) =>
    setForm((prev) => ({ ...prev, otherLinks: prev.otherLinks.map((link, i) => (i === index ? value : link)) }));
  const addOther = () =>
    setForm((prev) =>
      prev.otherLinks.length >= MAX_OTHER_LINKS ? prev : { ...prev, otherLinks: [...prev.otherLinks, ""] },
    );
  const removeOther = (index: number) =>
    setForm((prev) => ({ ...prev, otherLinks: prev.otherLinks.filter((_, i) => i !== index) }));
  const aboutLength = form.about.trim().length;
  const noProfileLink = !form.linkedinUrl.trim() && !form.githubUrl.trim() && !form.portfolioUrl.trim();

  let content: React.ReactNode;
  if (loading && !user) {
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
  } else if (fetchedFor !== userId) {
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
            <h2 style={{ fontSize: "18px" }}>About you</h2>
            <div>
              <label className="label" htmlFor="about">About you</label>
              <textarea id="about" className="input-field" rows={5} maxLength={ABOUT_MAX} value={form.about} onChange={set("about")} required />
              <div style={HELPER_STYLE}>
                Tell us about your background and what you want to build. {aboutLength}/{ABOUT_MAX} characters (minimum {ABOUT_MIN}).
              </div>
            </div>
            <h2 style={{ fontSize: "18px" }}>Resume</h2>
            <div>
              <label className="label" htmlFor="resumeUrl">Resume link</label>
              <input id="resumeUrl" className="input-field" type="url" maxLength={500} placeholder="https://" value={form.resumeUrl} onChange={set("resumeUrl")} required />
              <div style={HELPER_STYLE}>
                Share a Google Drive or other storage link to a soft copy of your resume or CV. Set sharing so staff can open it.
              </div>
            </div>
            <h2 style={{ fontSize: "18px" }}>Links</h2>
            <div style={HELPER_STYLE}>Add at least one of LinkedIn, GitHub or portfolio.</div>
            <div>
              <label className="label" htmlFor="linkedinUrl">LinkedIn</label>
              <input id="linkedinUrl" className="input-field" type="url" maxLength={300} placeholder="https://www.linkedin.com/in/your-name" value={form.linkedinUrl} onChange={set("linkedinUrl")} />
            </div>
            <div>
              <label className="label" htmlFor="githubUrl">GitHub profile</label>
              <input id="githubUrl" className="input-field" type="url" maxLength={300} placeholder="https://github.com/your-name" value={form.githubUrl} onChange={set("githubUrl")} />
              <div style={HELPER_STYLE}>Your profile, not a repository.</div>
            </div>
            <div>
              <label className="label" htmlFor="portfolioUrl">Portfolio</label>
              <input id="portfolioUrl" className="input-field" type="url" maxLength={300} placeholder="https://" value={form.portfolioUrl} onChange={set("portfolioUrl")} />
              <div style={HELPER_STYLE}>For example Behance, Dribbble or a personal site.</div>
            </div>
            {noProfileLink && <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{NEED_LINK_MESSAGE}</div>}
            <div>
              <div className="label">Other links (optional, up to {MAX_OTHER_LINKS})</div>
              {form.otherLinks.map((link, index) => (
                <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <input
                    className="input-field"
                    type="url"
                    maxLength={300}
                    placeholder="https://"
                    aria-label={`Other link ${index + 1}`}
                    value={link}
                    onChange={(e) => setOther(index, e.target.value)}
                  />
                  <button type="button" className="btn-secondary" onClick={() => removeOther(index)}>Remove</button>
                </div>
              ))}
              {form.otherLinks.length < MAX_OTHER_LINKS && (
                <button type="button" className="btn-secondary" onClick={addOther}>Add link</button>
              )}
            </div>
            <h2 style={{ fontSize: "18px" }}>Identity documents (KYC)</h2>
            <div>
              <label className="label" htmlFor="kycDocsUrl">KYC documents link</label>
              <input id="kycDocsUrl" className="input-field" type="url" maxLength={500} placeholder="https://" value={form.kycDocsUrl} onChange={set("kycDocsUrl")} required />
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                Share a Google Drive or other storage folder link with soft copies of your NIC and other required documents. Set sharing so staff can open it.
              </div>
            </div>
            <div>
              <label className="label" htmlFor="kycNote">Note for reviewer (optional)</label>
              <textarea id="kycNote" className="input-field" rows={3} maxLength={500} value={form.kycNote} onChange={set("kycNote")} />
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
