"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, UserRound } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  ApiError,
  describeApiError,
  approveApplication,
  getAdminApplication,
  getStaffUserProfile,
  listAdminApplications,
  rejectApplication,
  type ApplicationDto,
  type ApplicationStatus,
  type UserProfileDto,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  ADMIN_PAGE_SIZE as PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager as Pager,
  RelativeTime,
  Row,
  SafeLink,
  StatusFilter,
  badgeClass,
  statusLabel,
  toneFromBadge,
} from "./shared";

const STATUSES: ApplicationStatus[] = ["pending", "approved", "rejected"];
const NOTE_MAX = 500;

type ReviewAction = "approve" | "reject";

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
  const [detailError, setDetailError] = useState("");
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [kyc, setKyc] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [confirm, setConfirm] = useState<ReviewAction | null>(null);
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

  const listKey = `${tab}:${offset}:${reloadKey}`;
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
        setHasData(true);
        setLoadedKey(listKey);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setError(describeApiError(err, "Failed to load applications"));
        setLoadedKey(listKey);
      });
    return () => controller.abort();
  }, [tab, offset, reloadKey, listKey]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const { signal } = controller;
    getAdminApplication(selectedId, signal)
      .then((app) => {
        if (signal.aborted) return;
        setDetail(app);
        setDetailError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setDetailError(describeApiError(err, "Failed to load application"));
      });
    return () => controller.abort();
  }, [selectedId, reloadKey]);

  const choose = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setKyc(false);
    setNote("");
    setNoteError("");
    clearProfile();
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    clearProfile();
  };

  const selectTab = (value: ApplicationStatus | "") => {
    setTab(value === "" ? "all" : value);
    setOffset(0);
    closeDetail();
  };

  /** Validates the note inline, then asks for confirmation. */
  const requestReview = (action: ReviewAction) => {
    const trimmed = note.trim();
    if (action === "reject" && !trimmed) {
      setNoteError("A note is required to reject");
      return;
    }
    if (trimmed.length > NOTE_MAX) {
      setNoteError(`Note must be at most ${NOTE_MAX} characters`);
      return;
    }
    setNoteError("");
    setConfirm(action);
  };

  const review = async (action: ReviewAction): Promise<void> => {
    if (!detail) return;
    const trimmed = note.trim();
    if (action === "approve") await approveApplication(detail.id, trimmed || undefined);
    else await rejectApplication(detail.id, trimmed);
    toast.success(action === "approve" ? "Application approved" : "Application rejected");
    setKyc(false);
    setNote("");
    setReloadKey((k) => k + 1);
  };

  const reviewError = (err: unknown): string => {
    if (err instanceof ApiError && err.status === 403 && detail?.walletAddress.toLowerCase() === selfAddress.toLowerCase()) {
      return "You cannot review your own application";
    }
    if (err instanceof ApiError && err.status === 409) return "Already reviewed, refresh the list";
    return describeApiError(err, "Review failed");
  };

  const refresh = () => setReloadKey((k) => k + 1);

  const columns: ReadonlyArray<DataTableColumn<ApplicationDto>> = [
    {
      key: "applicant",
      header: "Application",
      cell: (a) => (
        <span className="cell-clip" title={a.projectName ? `${a.projectName}: ${aboutExcerpt(a)}` : aboutExcerpt(a)}>
          {a.projectName && <span className="cell-title">{a.projectName}: </span>}
          <span className="admin-muted">{aboutExcerpt(a)}</span>
        </span>
      ),
    },
    { key: "wallet", header: "Wallet", cell: (a) => <AddressChip address={a.walletAddress} /> },
    { key: "status", header: "Status", cell: (a) => <StatusPill tone={toneFromBadge(badgeClass(a.status))}>{statusLabel(a.status)}</StatusPill> },
    { key: "created", header: "Submitted", numeric: true, cell: (a) => <RelativeTime iso={a.createdAt} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (a) => (
        <Button variant={a.status === "pending" ? "secondary" : "ghost"} size="sm" onClick={() => choose(a.id)}>
          {a.status === "pending" ? "Review" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <section>
      <AdminPageHeader
        title="Applications"
        description="Founder applications with resume, links and KYC documents. Approve only after verifying the founder off-platform."
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <Card className="admin-toolbar">
        <StatusFilter options={STATUSES} value={tab === "all" ? "" : tab} onChange={selectTab} />
      </Card>
      <AdminListCard
        error={error}
        errorTitle="Could not load applications"
        onRetry={refresh}
        hasData={hasData}
        footer={<Pager offset={offset} total={total} onChange={setOffset} />}
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(a) => a.id}
          caption="Founder applications"
          loading={loadedKey !== listKey}
          dense
          stickyHeader
          emptyTitle="No applications."
        />
      </AdminListCard>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent
          title="Founder application"
          description="Check the resume, links and KYC documents before approving or rejecting."
          maxWidth={720}
          footer={
            detail?.status === "pending" ? (
              <>
                <Button variant="danger" onClick={() => requestReview("reject")}>
                  Reject
                </Button>
                <Button disabled={!kyc} onClick={() => requestReview("approve")}>
                  Approve
                </Button>
              </>
            ) : undefined
          }
        >
          {detailError && !detail && <InlineAlert tone="danger">{detailError}</InlineAlert>}
          {!detail && !detailError && (
            <div className="stack-sm" role="status">
              <Skeleton width="40%" />
              <Skeleton width="70%" />
              <Skeleton width="55%" />
              <span className="sr-only">Loading</span>
            </div>
          )}
          {detail && (
            <>
              {detailError && (
                <InlineAlert tone="danger" className="panel-gap">
                  {detailError}
                </InlineAlert>
              )}
              <dl className="admin-detail">
                <Row label="Status">
                  <StatusPill tone={toneFromBadge(badgeClass(detail.status))}>{statusLabel(detail.status)}</StatusPill>
                </Row>
                <Row label="Submitted">{new Date(detail.createdAt).toLocaleString()}</Row>
                <Row label="Wallet" wide>
                  <span className="mono">{detail.walletAddress}</span>
                </Row>
                {detail.about && (
                  <Row label="About" wide>
                    <span className="admin-detail-pre">{detail.about}</span>
                  </Row>
                )}
                <Row label="Resume" wide>
                  {detail.resumeUrl ? <SafeLink href={detail.resumeUrl} /> : "No resume link (legacy application)"}
                </Row>
                {detail.linkedinUrl && <Row label="LinkedIn" wide><SafeLink href={detail.linkedinUrl} /></Row>}
                {detail.githubUrl && <Row label="GitHub" wide><SafeLink href={detail.githubUrl} /></Row>}
                {detail.portfolioUrl && <Row label="Portfolio" wide><SafeLink href={detail.portfolioUrl} /></Row>}
                {detail.otherLinks?.map((link) => <Row key={link} label="Other link" wide><SafeLink href={link} /></Row>)}
                <Row label="KYC documents link" wide>
                  {detail.kycDocsUrl ? <SafeLink href={detail.kycDocsUrl} /> : "No documents link (submitted before this field existed)"}
                </Row>
                {detail.kycNote && (
                  <Row label="Applicant note" wide>
                    <span className="admin-detail-pre">{detail.kycNote}</span>
                  </Row>
                )}
                {detail.reviewNote && <Row label="Review note" wide>{detail.reviewNote}</Row>}
                {detail.kycVerifiedAt && <Row label="KYC verified at">{new Date(detail.kycVerifiedAt).toLocaleString()}</Row>}
              </dl>

              {(detail.projectName || detail.summary || detail.websiteUrl || detail.pitchDeckUrl || detail.repoUrl || detail.contact) && (
                <div className="admin-section">
                  <h3 className="admin-section-title">Legacy project details</h3>
                  <dl className="admin-detail">
                    {detail.projectName && <Row label="Project name">{detail.projectName}</Row>}
                    {detail.contact && <Row label="Contact">{detail.contact}</Row>}
                    {detail.summary && (
                      <Row label="Summary" wide>
                        <span className="admin-detail-pre">{detail.summary}</span>
                      </Row>
                    )}
                    {detail.websiteUrl && <Row label="Website" wide><SafeLink href={detail.websiteUrl} /></Row>}
                    {detail.pitchDeckUrl && <Row label="Pitch deck" wide><SafeLink href={detail.pitchDeckUrl} /></Row>}
                    {detail.repoUrl && <Row label="Repository" wide><SafeLink href={detail.repoUrl} /></Row>}
                  </dl>
                </div>
              )}

              <div className="admin-section">
                <h3 className="admin-section-title">Applicant profile</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={profileLoading}
                  onClick={() => viewProfile(detail.walletAddress)}
                  leftIcon={<UserRound size={14} aria-hidden="true" />}
                >
                  {profileLoading ? "Loading…" : "View applicant profile"}
                </Button>
                {profileError && (
                  <InlineAlert tone="danger" className="admin-section-alert">
                    {profileError}
                  </InlineAlert>
                )}
                {profileLoaded && !applicantProfile && <p className="panel-note" style={{ marginTop: 8 }}>No profile on file</p>}
                {applicantProfile && (
                  <dl className="admin-detail" style={{ marginTop: 12 }}>
                    <Row label="Name">{applicantProfile.firstName} {applicantProfile.lastName}</Row>
                    <Row label="Email">{applicantProfile.email}</Row>
                    <Row label="Phone">{applicantProfile.phone}</Row>
                    <Row label="Date of birth">{applicantProfile.dateOfBirth}</Row>
                    <Row label="Address" wide>
                      {[
                        applicantProfile.addressLine1,
                        applicantProfile.addressLine2,
                        applicantProfile.city,
                        applicantProfile.region,
                        applicantProfile.postalCode,
                        applicantProfile.country,
                      ].filter((part): part is string => Boolean(part)).join(", ")}
                    </Row>
                  </dl>
                )}
              </div>

              {detail.status === "pending" && (
                <div className="admin-section stack-md">
                  <h3 className="admin-section-title" style={{ marginBottom: 0 }}>Review</h3>
                  <label className="admin-check-row">
                    <input type="checkbox" checked={kyc} onChange={(e) => setKyc(e.target.checked)} />
                    I verified this founder off-platform (KYC)
                  </label>
                  <Field label="Note (required to reject)" error={noteError || undefined} hint={`Up to ${NOTE_MAX} characters.`}>
                    <Textarea
                      rows={3}
                      maxLength={NOTE_MAX}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        if (noteError) setNoteError("");
                      }}
                    />
                  </Field>
                  {!kyc && <p className="panel-note">Tick the KYC confirmation to enable Approve.</p>}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm === "reject" ? "Reject this application?" : "Approve this application?"}
        body={
          confirm === "reject"
            ? "The application is marked rejected with your note."
            : "You confirmed the off-platform KYC check. The application is marked approved."
        }
        confirmLabel={confirm === "reject" ? "Reject application" : "Approve application"}
        tone={confirm === "reject" ? "danger" : "primary"}
        onConfirm={async () => {
          if (confirm) await review(confirm);
        }}
        describeError={reviewError}
      />
    </section>
  );
}
