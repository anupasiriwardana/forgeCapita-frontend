"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { LogIn, Plus, X } from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { toast } from "@/lib/toast";
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

function SafeLink({ href }: { href: string }) {
  if (!href.startsWith("https://")) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-accent" style={{ wordBreak: "break-all" }}>
      {href}
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv-row" style={{ display: "block" }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 14, textAlign: "left", color: "var(--text)" }}>{children}</div>
    </div>
  );
}

function statusTone(status: string): StatusTone {
  return status === "approved" ? "success" : status === "pending" ? "warning" : "neutral";
}

function StatusCard({ app }: { app: ApplicationDto }) {
  return (
    <Card>
      <CardHeader title={app.projectName ?? "Founder application"} actions={<StatusPill tone={statusTone(app.status)}>{app.status}</StatusPill>} />
      <CardBody>
        <div className="kv-list">
      <Row label="Submitted"><span className="num">{new Date(app.createdAt).toLocaleString()}</span></Row>
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
      </CardBody>
    </Card>
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
        toast.success("Application submitted", { description: "Staff will review it." });
        setForm(EMPTY_FORM);
        setFetchedFor(undefined);
        setReloadKey((k) => k + 1);
      } catch (err) {
        const message = describeApiError(err, "Could not submit the application");
        setFormError(message);
        toast.error(message);
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

  const loadingBlock = (
    <div className="gate-loading" role="status">
      <Spinner size={16} />
      Loading…
    </div>
  );

  let content: React.ReactNode;
  if (loading && !user) {
    content = loadingBlock;
  } else if (!user) {
    content = (
      <Card>
        <EmptyState
          icon={<LogIn size={20} />}
          title="Please sign in to apply as a founder."
          action={<Button onClick={() => void signIn()}>Sign in</Button>}
        />
      </Card>
    );
  } else if (role === "staff" || role === "admin") {
    content = (
      <InlineAlert tone="warning">
        Applications are for investors and founders. Review them in <Link href="/admin/applications" className="link-accent">Admin</Link>.
      </InlineAlert>
    );
  } else if (fetchedFor !== userId) {
    content = loadingBlock;
  } else {
    const showForm = !loadError && (application === null || application.status === "rejected");
    content = (
      <div className="section-stack">
        {loadError && <InlineAlert tone="danger">{loadError}</InlineAlert>}
        {application?.status === "approved" && <InlineAlert tone="success">You are an approved founder.</InlineAlert>}
        {application?.status === "pending" && <InlineAlert tone="warning">Your application is pending review.</InlineAlert>}
        {application && <StatusCard app={application} />}
        {showForm && (
          <form onSubmit={(e) => void onSubmit(e)}>
            <Card>
              {application?.status === "rejected" && (
                <CardBody style={{ paddingBottom: 0 }}>
                  <InlineAlert tone="warning">Your application was rejected. You may re-apply.</InlineAlert>
                </CardBody>
              )}
              <CardHeader title="About you" />
              <CardBody>
                <Field
                  label="About you"
                  id="about"
                  required
                  hint={
                    <>
                      Tell us about your background and what you want to build.{" "}
                      <span className="num">{aboutLength}/{ABOUT_MAX}</span> characters (minimum {ABOUT_MIN}).
                    </>
                  }
                >
                  <Textarea rows={5} maxLength={ABOUT_MAX} value={form.about} onChange={set("about")} required />
                </Field>
              </CardBody>

              <CardHeader title="Resume" style={{ borderTop: "1px solid var(--border)" }} />
              <CardBody>
                <Field
                  label="Resume link"
                  id="resumeUrl"
                  required
                  hint="Share a Google Drive or other storage link to a soft copy of your resume or CV. Set sharing so staff can open it."
                >
                  <Input type="url" maxLength={500} placeholder="https://" value={form.resumeUrl} onChange={set("resumeUrl")} required />
                </Field>
              </CardBody>

              <CardHeader title="Links" subtitle="Add at least one of LinkedIn, GitHub or portfolio." style={{ borderTop: "1px solid var(--border)" }} />
              <CardBody className="form-grid">
                <Field label="LinkedIn" id="linkedinUrl">
                  <Input type="url" maxLength={300} placeholder="https://www.linkedin.com/in/your-name" value={form.linkedinUrl} onChange={set("linkedinUrl")} />
                </Field>
                <div className="form-grid form-grid-2">
                  <Field label="GitHub profile" id="githubUrl" hint="Your profile, not a repository.">
                    <Input type="url" maxLength={300} placeholder="https://github.com/your-name" value={form.githubUrl} onChange={set("githubUrl")} />
                  </Field>
                  <Field label="Portfolio" id="portfolioUrl" hint="For example Behance, Dribbble or a personal site.">
                    <Input type="url" maxLength={300} placeholder="https://" value={form.portfolioUrl} onChange={set("portfolioUrl")} />
                  </Field>
                </div>
                {noProfileLink && <InlineAlert tone="info">{NEED_LINK_MESSAGE}</InlineAlert>}
                <div>
                  <div className="label">Other links (optional, up to {MAX_OTHER_LINKS})</div>
                  <div className="stack-sm">
                    {form.otherLinks.map((link, index) => (
                      <div key={index} className="input-row">
                        <Input
                          type="url"
                          maxLength={300}
                          placeholder="https://"
                          aria-label={`Other link ${index + 1}`}
                          value={link}
                          onChange={(e) => setOther(index, e.target.value)}
                        />
                        <Button variant="ghost" className="icon-btn" style={{ height: 42, width: 42 }} aria-label={`Remove other link ${index + 1}`} onClick={() => removeOther(index)}>
                          <X size={16} aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    {form.otherLinks.length < MAX_OTHER_LINKS && (
                      <div>
                        <Button variant="secondary" size="sm" onClick={addOther} leftIcon={<Plus size={14} aria-hidden="true" />}>
                          Add link
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardBody>

              <CardHeader title="Identity documents (KYC)" style={{ borderTop: "1px solid var(--border)" }} />
              <CardBody className="form-grid">
                <Field
                  label="KYC documents link"
                  id="kycDocsUrl"
                  required
                  hint="Share a Google Drive or other storage folder link with soft copies of your NIC and other required documents. Set sharing so staff can open it."
                >
                  <Input type="url" maxLength={500} placeholder="https://" value={form.kycDocsUrl} onChange={set("kycDocsUrl")} required />
                </Field>
                <Field label="Note for reviewer (optional)" id="kycNote">
                  <Textarea rows={3} maxLength={500} value={form.kycNote} onChange={set("kycNote")} />
                </Field>
              </CardBody>

              <CardFooter style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
                </div>
                <Button type="submit" loading={sending}>
                  {sending ? "Submitting…" : "Submit application"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="page-container page-container-narrow">
      <div className="page-title-row">
        <div>
          <h1>Apply as a founder</h1>
          <p>Tell us about yourself and share your resume, profile links and KYC documents. Staff review every application.</p>
        </div>
      </div>
      {content}
    </div>
  );
}
