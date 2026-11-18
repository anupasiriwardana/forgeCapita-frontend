"use client";

import { useCallback, useState } from "react";
import { ArrowRight, RotateCw } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, Input } from "@/components/ui/Field";
import { listAuditLog, type AuditLogEntryDto } from "@/lib/api";
import {
  ADDRESS_REGEX,
  ADMIN_PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager,
  RelativeTime,
  shortId,
  truncate,
  useAdminList,
} from "./shared";

const ACTION_REGEX = /^[a-z_]+(\.[a-z_]+)?$/;

const COLUMNS: ReadonlyArray<DataTableColumn<AuditLogEntryDto>> = [
  { key: "time", header: "Time", numeric: true, cell: (e) => <RelativeTime iso={e.createdAt} /> },
  { key: "action", header: "Action", cell: (e) => <span className="mono" style={{ fontSize: 12 }}>{e.action}</span> },
  { key: "target", header: "Target", cell: (e) => (e.target ? <AddressChip address={e.target} /> : <span className="cell-sub">-</span>) },
  {
    key: "change",
    header: "Change",
    cell: (e) => (
      <span className="text-wrap" style={{ fontSize: 13 }} title={`${e.before ?? ""} -> ${e.after ?? ""}`}>
        <span className="admin-muted">{truncate(e.before ?? "-", 24)}</span>{" "}
        <ArrowRight size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "middle", color: "var(--text-3)" }} />
        <span className="sr-only"> changed to </span> {truncate(e.after ?? "-", 24)}
      </span>
    ),
  },
  {
    key: "actor",
    header: "Actor",
    cell: (e) => (
      <span className="mono cell-sub" title={e.actorUserId ?? undefined}>
        {e.actorUserId ? shortId(e.actorUserId) : "-"}
      </span>
    ),
  },
  { key: "ip", header: "IP", cell: (e) => <span className="mono cell-sub">{e.ip ?? "-"}</span> },
];

export function AuditLogTab() {
  const [offset, setOffset] = useState(0);
  const [actionInput, setActionInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const action = actionInput.trim();
  const target = targetInput.trim().toLowerCase();
  const actionValid = action === "" || (action.length <= 64 && ACTION_REGEX.test(action));
  const targetValid = target === "" || ADDRESS_REGEX.test(target);
  const valid = actionValid && targetValid;

  const load = useCallback(
    (signal: AbortSignal) =>
      listAuditLog(
        { limit: ADMIN_PAGE_SIZE, offset, action: action || undefined, target: target || undefined },
        signal,
      ),
    [offset, action, target],
  );
  const { page, error, loading } = useAdminList(valid ? load : null, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <AdminPageHeader
        title="Audit log"
        description="Append-only record of staff and admin actions, newest first."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <Card className="admin-toolbar">
        <Field
          label="Action"
          className="toolbar-field"
          error={!actionValid ? "Action must be lowercase letters and underscores, optionally one dot" : undefined}
        >
          <Input
            placeholder="e.g. role.change"
            maxLength={64}
            value={actionInput}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setActionInput(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field
          label="Target address"
          className="toolbar-field toolbar-field-wide"
          error={!targetValid ? "Target must be a full 0x address" : undefined}
        >
          <Input
            placeholder="0x…"
            maxLength={42}
            value={targetInput}
            spellCheck={false}
            autoComplete="off"
            className="mono"
            onChange={(e) => {
              setTargetInput(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
      </Card>
      <AdminListCard
        error={error}
        errorTitle="Could not load the audit log"
        onRetry={() => setReloadKey((k) => k + 1)}
        hasData={page !== null}
        footer={<AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />}
      >
        <DataTable
          columns={COLUMNS}
          rows={items}
          rowKey={(e) => e.id}
          caption="Audit log entries"
          loading={loading}
          dense
          stickyHeader
          emptyTitle="No audit entries."
        />
      </AdminListCard>
    </section>
  );
}
