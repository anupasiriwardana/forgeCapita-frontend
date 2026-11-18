"use client";

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, Textarea } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  ApiError,
  describeFounderError,
  approveShadowWallet,
  listAdminShadowWallets,
  rejectShadowWallet,
  type ShadowWalletStatus,
  type StaffShadowWalletDto,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  ADMIN_PAGE_SIZE as PAGE_SIZE,
  AdminListCard,
  errorRequestId,
  AdminPageHeader,
  AdminPager as Pager,
  RelativeTime,
  badgeClass,
  statusLabel,
  toneFromBadge,
} from "./shared";

const WALLET_TABS: { value: ShadowWalletStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
const NOTE_MAX = 500;

type ReviewAction = "approve" | "reject";

interface PendingReview {
  wallet: StaffShadowWalletDto;
  action: ReviewAction;
}

function reviewError(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return "You cannot review your own wallet";
  if (err instanceof ApiError && err.status === 404) return "Shadow wallet not found, refresh the list";
  return describeFounderError(err, "Review failed");
}

export function ShadowWalletsTab() {
  const [tab, setTab] = useState<ShadowWalletStatus>("pending");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<StaffShadowWalletDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [errorRef, setErrorRef] = useState<string | undefined>(undefined);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [note, setNote] = useState("");

  const listKey = `${tab}:${offset}:${reloadKey}`;
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listAdminShadowWallets(tab, PAGE_SIZE, offset, signal)
      .then((page) => {
        if (signal.aborted) return;
        setItems(page.items);
        setTotal(page.total);
        setError("");
        setErrorRef(undefined);
        setHasData(true);
        setLoadedKey(listKey);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setError(describeFounderError(err, "Failed to load shadow wallets"));
        setErrorRef(errorRequestId(err));
        setLoadedKey(listKey);
      });
    return () => controller.abort();
  }, [tab, offset, reloadKey, listKey]);

  const openReview = (wallet: StaffShadowWalletDto, action: ReviewAction) => {
    setNote("");
    setPending({ wallet, action });
  };

  const trimmed = note.trim();
  const isReject = pending?.action === "reject";

  const review = async (): Promise<void> => {
    if (!pending) return;
    const { wallet, action } = pending;
    if (action === "approve") await approveShadowWallet(wallet.id, trimmed || undefined);
    else await rejectShadowWallet(wallet.id, trimmed);
    toast.success(action === "approve" ? "Shadow wallet approved" : "Shadow wallet rejected");
    setReloadKey((k) => k + 1);
  };

  const refresh = () => setReloadKey((k) => k + 1);

  const columns: ReadonlyArray<DataTableColumn<StaffShadowWalletDto>> = [
    { key: "address", header: "Shadow wallet", cell: (w) => <AddressChip address={w.address} /> },
    { key: "founder", header: "Founder", cell: (w) => <AddressChip address={w.founderWallet} /> },
    { key: "status", header: "Status", cell: (w) => <StatusPill tone={toneFromBadge(badgeClass(w.status))}>{statusLabel(w.status)}</StatusPill> },
    { key: "created", header: "Requested", numeric: true, cell: (w) => <RelativeTime iso={w.createdAt} /> },
    {
      key: "review",
      header: "Review note",
      cell: (w) =>
        w.reviewNote || w.reviewedAt ? (
          <div className="cell-sub text-wrap" style={{ maxWidth: 280 }}>
            {w.reviewNote}
            {w.reviewedAt && ` (reviewed ${new Date(w.reviewedAt).toLocaleString()})`}
          </div>
        ) : (
          <span className="cell-sub">-</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (w) =>
        w.status === "pending" ? (
          <div className="row-actions">
            <Button variant="danger" size="sm" onClick={() => openReview(w, "reject")} aria-label={`Reject ${w.address}`}>
              Reject
            </Button>
            <Button size="sm" onClick={() => openReview(w, "approve")} aria-label={`Approve ${w.address}`}>
              Approve
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <section>
      <AdminPageHeader
        title="Shadow wallets"
        description="Founder revenue wallets awaiting review. Approved wallets are watched by the revenue audit."
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <Card className="admin-toolbar">
        <div className="admin-filter">
          <span className="label" aria-hidden="true">
            Status
          </span>
          <SegmentedControl
            options={WALLET_TABS}
            value={tab}
            onChange={(value) => {
              setTab(value);
              setOffset(0);
            }}
            label="Filter by status"
          />
        </div>
      </Card>
      <AdminListCard
        error={error}
        requestId={errorRef}
        errorTitle="Could not load shadow wallets"
        onRetry={refresh}
        hasData={hasData}
        footer={<Pager offset={offset} total={total} onChange={setOffset} />}
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(w) => w.id}
          caption="Shadow wallets"
          loading={loadedKey !== listKey}
          dense
          stickyHeader
          emptyTitle="No shadow wallets."
        />
      </AdminListCard>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={isReject ? "Reject this shadow wallet?" : "Approve this shadow wallet?"}
        body={
          pending ? (
            <>
              Shadow wallet <span className="mono">{pending.wallet.address}</span> for founder{" "}
              <span className="mono">{pending.wallet.founderWallet}</span>.
            </>
          ) : (
            ""
          )
        }
        confirmLabel={isReject ? "Reject wallet" : "Approve wallet"}
        tone={isReject ? "danger" : "primary"}
        confirmDisabled={isReject && trimmed === ""}
        onConfirm={review}
        describeError={reviewError}
      >
        <Field
          label={isReject ? "Note (required to reject)" : "Note (optional)"}
          required={isReject}
          hint={isReject && trimmed === "" ? "A note is required to reject." : `Up to ${NOTE_MAX} characters.`}
        >
          <Textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
