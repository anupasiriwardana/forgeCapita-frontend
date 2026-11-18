"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { RotateCw } from "lucide-react";
import { CATEGORY_LABELS, complaintBadge } from "@/components/ComplaintDialog";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusPill } from "@/components/ui/StatusPill";
import { chainName } from "@/config/chains";
import {
  ApiError,
  listAdminComplaints,
  patchAdminComplaint,
  shortAddr,
  type AdminComplaintDto,
  type ComplaintStatus,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  ADMIN_PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager,
  RelativeTime,
  Row,
  SafeLink,
  StatusFilter,
  statusLabel,
  toneFromBadge,
  useAdminList,
} from "./shared";

const STATUSES: ComplaintStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"];
const NOTE_MAX = 1000;

interface PendingChange {
  next: ComplaintStatus;
  item: AdminComplaintDto;
}

function nextStatuses(status: ComplaintStatus): ComplaintStatus[] {
  if (status === "OPEN") return ["INVESTIGATING", "RESOLVED", "DISMISSED"];
  if (status === "INVESTIGATING") return ["RESOLVED", "DISMISSED"];
  return [];
}

function noteRequired(status: ComplaintStatus): boolean {
  return status === "RESOLVED" || status === "DISMISSED";
}

export function ComplaintsTab() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<ComplaintStatus | "">("");
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminComplaints({ limit: ADMIN_PAGE_SIZE, offset, status: status || undefined }, signal),
    [offset, status],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];
  const selected = openId ? (items.find((c) => c.id === openId) ?? null) : null;

  const openDialog = (next: ComplaintStatus, item: AdminComplaintDto): void => {
    setNote("");
    setNotice("");
    setPending({ next, item });
  };

  const trimmed = note.trim();
  const needsNote = pending !== null && noteRequired(pending.next);

  const submit = async (): Promise<void> => {
    if (!pending || (needsNote && trimmed === "")) return;
    try {
      await patchAdminComplaint(pending.item.id, pending.next, trimmed || undefined);
      toast.success(`Complaint marked ${pending.next.toLowerCase()}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReloadKey((k) => k + 1);
        setNotice("Complaint status changed in the meantime; list refreshed");
        return;
      }
      throw err;
    }
  };

  const refresh = () => setReloadKey((k) => k + 1);

  const columns: ReadonlyArray<DataTableColumn<AdminComplaintDto>> = [
    { key: "category", header: "Category", cell: (c) => <span className="cell-title">{CATEGORY_LABELS[c.category]}</span> },
    {
      key: "project",
      header: "Project",
      cell: (c) => (
        <Link href={`/projects/${encodeURIComponent(c.projectId)}`} className="link-accent mono" style={{ fontSize: 12 }} title={c.projectId}>
          {c.chainId}:{shortAddr(c.projectId.split(":")[1] ?? c.projectId)}
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (c) => <StatusPill tone={toneFromBadge(complaintBadge(c.status))}>{statusLabel(c.status)}</StatusPill> },
    { key: "created", header: "Filed", numeric: true, cell: (c) => <RelativeTime iso={c.createdAt} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) => (
        <Button variant={nextStatuses(c.status).length > 0 ? "secondary" : "ghost"} size="sm" onClick={() => setOpenId(c.id)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <section>
      <AdminPageHeader
        title="Complaints"
        description="Investor reports about projects. Visible to staff and the reporter only. Notes you add are shown to the reporter."
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <Card className="admin-toolbar">
        <StatusFilter
          options={STATUSES}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setOffset(0);
          }}
        />
      </Card>
      {notice && (
        <InlineAlert tone="warning" className="panel-gap">
          {notice}
        </InlineAlert>
      )}
      <AdminListCard
        error={error}
        errorTitle="Could not load complaints"
        onRetry={refresh}
        hasData={page !== null}
        footer={<AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />}
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id}
          caption="Complaints"
          loading={loading}
          dense
          stickyHeader
          emptyTitle="No complaints."
        />
      </AdminListCard>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent
          title={selected ? `${CATEGORY_LABELS[selected.category]} complaint` : "Complaint"}
          description="Triage the report. Resolved and dismissed complaints cannot be reopened."
          maxWidth={640}
          footer={
            selected && nextStatuses(selected.status).length > 0 ? (
              <>
                {nextStatuses(selected.status).map((s) => (
                  <Button key={s} variant={s === "DISMISSED" ? "danger" : "secondary"} onClick={() => openDialog(s, selected)}>
                    Mark {s.toLowerCase()}
                  </Button>
                ))}
              </>
            ) : undefined
          }
        >
          {selected && (
            <dl className="admin-detail">
              <Row label="Status">
                <StatusPill tone={toneFromBadge(complaintBadge(selected.status))}>{statusLabel(selected.status)}</StatusPill>
              </Row>
              <Row label="Filed">{new Date(selected.createdAt).toLocaleString()}</Row>
              <Row label="Reporter">
                <AddressChip address={selected.reporterAddress} />
              </Row>
              <Row label="Network">{chainName(selected.chainId)}</Row>
              <Row label="Report" wide>
                <span className="admin-detail-pre">{selected.body}</span>
              </Row>
              {selected.evidenceUrl && (
                <Row label="Evidence" wide>
                  <SafeLink href={selected.evidenceUrl} />
                </Row>
              )}
              {selected.staffNote && (
                <Row label="Note shown to reporter" wide>
                  <span className="admin-detail-pre">{selected.staffNote}</span>
                </Row>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? `Mark complaint ${pending.next.toLowerCase()}?` : "Update complaint"}
        body="The change is recorded in the audit log. Resolved and dismissed complaints cannot be reopened."
        confirmLabel="Confirm"
        tone={pending?.next === "DISMISSED" ? "danger" : "primary"}
        confirmDisabled={needsNote && trimmed === ""}
        onConfirm={submit}
        errorFallback="Action failed"
      >
        <Field
          label={needsNote ? "Note (required)" : "Note (optional)"}
          required={needsNote}
          hint={
            needsNote && trimmed === ""
              ? "This note is shown to the person who filed the complaint. A note is required to confirm."
              : "This note is shown to the person who filed the complaint."
          }
        >
          <Textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
