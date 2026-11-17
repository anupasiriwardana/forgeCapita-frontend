"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  describeApiError,
  approveApplication,
  getAdminApplication,
  getStaffUserProfile,
  listAdminApplications,
  rejectApplication,
  shortAddr,
  type ApplicationDto,
  type ApplicationStatus,
  type UserProfileDto,
} from "@/lib/api";
import { ADMIN_PAGE_SIZE as PAGE_SIZE, AdminPager as Pager, Row, SafeLink, badgeClass } from "./shared";

const TABS: { key: ApplicationStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function aboutExcerpt(a: ApplicationDto): string {
  const text = a.about ?? a.summary ?? "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function ApplicationsTab({ selfAddress }: { selfAddress: string }) {
  const [tab, setTab] = useState<ApplicationStatus | "all">("pending");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ApplicationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDto | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [kyc, setKyc] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [applicantProfile, setApplicantProfile] = useState<UserProfileDto | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const profileController = useRef<AbortController | null>(null);

  const clearProfile = useCallback(() => {
    profileController.current?.abort();
    profileController.current = null;
    setApplicantProfile(null);
    setProfileLoaded(false);
    setProfileLoading(false);
    setProfileError("");
  }, []);

  useEffect(() => () => profileController.current?.abort(), []);

  const viewProfile = (address: string) => {
    profileController.current?.abort();
    const controller = new AbortController();
    profileController.current = controller;
    const { signal } = controller;
    setProfileLoading(true);
    setProfileError("");
    getStaffUserProfile(address, signal)
      .then((p) => {
        if (signal.aborted) return;
        setApplicantProfile(p);
        setProfileLoaded(true);
        setProfileLoading(false);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setProfileError(describeApiError(err, "Failed to load profile"));
        setProfileLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listAdminApplications(
      { status: tab === "all" ? undefined : tab, limit: PAGE_SIZE, offset },
      signal,
    )
      .then((page) => {
        if (signal.aborted) return;
        setItems(page.items);
        setTotal(page.total);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load applications"));
      });
    return () => controller.abort();
  }, [tab, offset, reloadKey]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const { signal } = controller;
    getAdminApplication(selectedId, signal)
      .then((app) => {
        if (!signal.aborted) setDetail(app);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load application"));
      });
    return () => controller.abort();
  }, [selectedId, reloadKey]);

  const choose = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setKyc(false);
    setNote("");
    setSuccess("");
    clearProfile();
  };

  const review = useCallback(
    async (action: "approve" | "reject") => {
      if (!detail || busy) return;
      const trimmed = note.trim();
      if (action === "reject" && !trimmed) {
        setError("A note is required to reject");
        return;
      }
      if (trimmed.length > 500) {
        setError("Note must be at most 500 characters");
        return;
      }
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        if (action === "approve") await approveApplication(detail.id, trimmed || undefined);
        else await rejectApplication(detail.id, trimmed);
        setSuccess(action === "approve" ? "Application approved" : "Application rejected");
        setKyc(false);
        setNote("");
        setReloadKey((k) => k + 1);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403 && detail.walletAddress.toLowerCase() === selfAddress.toLowerCase()) {
          setError("You cannot review your own application");
        } else if (err instanceof ApiError && err.status === 409) {
          setError("Already reviewed, refresh the list");
        } else {
          setError(describeApiError(err, "Review failed"));
        }
      } finally {
        setBusy(false);
      }
    },
    [detail, busy, note, selfAddress],
  );

  return (
    <section style={{ marginBottom: "48px" }}>
      <h1 style={{ fontSize: "22px", marginBottom: "16px" }}>Applications</h1>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setTab(t.key);
              setOffset(0);
              setSelectedId(null);
              setDetail(null);
              setSuccess("");
              clearProfile();
            }}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      {success && <div role="status" className="alert alert-success" style={{ marginBottom: "12px" }}>{success}</div>}
      <div className="glass-card" style={{ padding: "8px" }}>
        {items.length === 0 && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>No applications.</p>}
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => choose(a.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
              gap: "8px",
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              background: a.id === selectedId ? "rgba(99,102,241,0.12)" : "transparent",
              border: "none",
              borderBottom: "1px solid var(--border)",
              color: "inherit",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.projectName ? `${a.projectName}: ` : ""}
              {aboutExcerpt(a)}
            </span>
            <span>{shortAddr(a.walletAddress)}</span>
            <span><span className={`badge ${badgeClass(a.status)}`}>{a.status}</span></span>
            <span style={{ color: "var(--text-secondary)" }}>{new Date(a.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />

      {selectedId && (
        <div className="glass-card" style={{ padding: "24px", marginTop: "16px" }}>
          {!detail ? (
            <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
          ) : (
            <>
              <h3 style={{ fontSize: "18px", marginBottom: "12px" }}>Founder application</h3>
              <Row label="Status">{detail.status}</Row>
              <Row label="Wallet">{detail.walletAddress}</Row>
              {detail.about && <Row label="About"><span style={{ whiteSpace: "pre-wrap" }}>{detail.about}</span></Row>}
              <Row label="Resume">
                {detail.resumeUrl ? <SafeLink href={detail.resumeUrl} /> : "No resume link (legacy application)"}
              </Row>
              {detail.linkedinUrl && <Row label="LinkedIn"><SafeLink href={detail.linkedinUrl} /></Row>}
              {detail.githubUrl && <Row label="GitHub"><SafeLink href={detail.githubUrl} /></Row>}
              {detail.portfolioUrl && <Row label="Portfolio"><SafeLink href={detail.portfolioUrl} /></Row>}
              {detail.otherLinks?.map((link) => <Row key={link} label="Other link"><SafeLink href={link} /></Row>)}
              <Row label="Submitted">{new Date(detail.createdAt).toLocaleString()}</Row>
              <Row label="KYC documents link">
                {detail.kycDocsUrl ? <SafeLink href={detail.kycDocsUrl} /> : "No documents link (submitted before this field existed)"}
              </Row>
              {detail.kycNote && <Row label="Applicant note"><span style={{ whiteSpace: "pre-wrap" }}>{detail.kycNote}</span></Row>}
              {(detail.projectName || detail.summary || detail.websiteUrl || detail.pitchDeckUrl || detail.repoUrl || detail.contact) && (
                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>Legacy project details</div>
                  {detail.projectName && <Row label="Project name">{detail.projectName}</Row>}
                  {detail.summary && <Row label="Summary"><span style={{ whiteSpace: "pre-wrap" }}>{detail.summary}</span></Row>}
                  {detail.websiteUrl && <Row label="Website"><SafeLink href={detail.websiteUrl} /></Row>}
                  {detail.pitchDeckUrl && <Row label="Pitch deck"><SafeLink href={detail.pitchDeckUrl} /></Row>}
                  {detail.repoUrl && <Row label="Repository"><SafeLink href={detail.repoUrl} /></Row>}
                  {detail.contact && <Row label="Contact">{detail.contact}</Row>}
                </div>
              )}
              <div style={{ marginBottom: "10px" }}>
                <button type="button" className="btn-secondary" disabled={profileLoading} onClick={() => viewProfile(detail.walletAddress)}>
                  {profileLoading ? "Loading…" : "View applicant profile"}
                </button>
                {profileError && <div role="alert" className="alert alert-error" style={{ marginTop: "8px" }}>{profileError}</div>}
                {profileLoaded && !applicantProfile && (
                  <p style={{ marginTop: "8px", color: "var(--text-secondary)" }}>No profile on file</p>
                )}
                {applicantProfile && (
                  <div style={{ marginTop: "8px" }}>
                    <Row label="Name">{applicantProfile.firstName} {applicantProfile.lastName}</Row>
                    <Row label="Email">{applicantProfile.email}</Row>
                    <Row label="Phone">{applicantProfile.phone}</Row>
                    <Row label="Address">
                      {[
                        applicantProfile.addressLine1,
                        applicantProfile.addressLine2,
                        applicantProfile.city,
                        applicantProfile.region,
                        applicantProfile.postalCode,
                        applicantProfile.country,
                      ].filter((part): part is string => Boolean(part)).join(", ")}
                    </Row>
                    <Row label="Date of birth">{applicantProfile.dateOfBirth}</Row>
                  </div>
                )}
              </div>
              {detail.reviewNote && <Row label="Review note">{detail.reviewNote}</Row>}
              {detail.kycVerifiedAt && <Row label="KYC verified at">{new Date(detail.kycVerifiedAt).toLocaleString()}</Row>}
              {detail.status === "pending" && (
                <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                  <label style={{ fontSize: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="checkbox" checked={kyc} onChange={(e) => setKyc(e.target.checked)} />
                    I verified this founder off-platform (KYC)
                  </label>
                  <div>
                    <label className="label" htmlFor="reviewNote">Note (required to reject)</label>
                    <textarea id="reviewNote" className="input-field" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button type="button" className="btn-success" disabled={!kyc || busy} onClick={() => void review("approve")}>
                      Approve
                    </button>
                    <button type="button" className="btn-danger" disabled={busy} onClick={() => void review("reject")}>
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
