"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { RotateCw } from "lucide-react";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import { chainName } from "@/config/chains";
import {
  ApiError,
  formatNative,
  listAdminCompliance,
  resolveComplianceCase,
  shortAddr,
  shutdownComplianceCase,
  type ComplianceCaseDto,
  type ComplianceState,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { complianceBadge, formatBps } from "@/components/TransparencyPanel";
import {
  ADMIN_PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager,
  RelativeTime,
  StatusFilter,
  toneFromBadge,
  useAdminList,
} from "./shared";

const STATES: ComplianceState[] = ["OK", "WARNED", "ESCALATED", "RESOLVED", "SHUTDOWN"];
const CHAINS = [421614, 97];
const NOTE_MAX = 500;

type ActionKind = "resolve" | "shutdown";
interface PendingAction {
  kind: ActionKind;
  item: ComplianceCaseDto;
}

function shortProject(projectId: string): string {
  const [chain, escrow] = projectId.split(":");
  return escrow ? `${chain}:${shortAddr(escrow)}` : projectId;
}

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "-";
}

function fmtDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-";
}

/** Compact "Oct 19 - Nov 18" window with the full date-time range in a tooltip; the resolution note is clipped below. */
function WindowCell({ item }: { item: ComplianceCaseDto }) {
  const full = `${fmtTime(item.windowStart)} to ${fmtTime(item.windowEnd)}`;
  return (
    <div>
      {item.windowStart || item.windowEnd ? (
        <Tooltip content={full}>
          <span tabIndex={0} className="admin-time num">
            {fmtDay(item.windowStart)} - {fmtDay(item.windowEnd)}
            <span className="sr-only"> ({full})</span>
          </span>
        </Tooltip>
      ) : (
        <span className="cell-sub">-</span>
      )}
      {item.resolutionNote && (
        <span className="cell-sub cell-clip" style={{ maxWidth: 200 }} title={item.resolutionNote}>
          {item.resolutionNote}
        </span>
      )}
    </div>
  );
}

export function ComplianceTab() {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<ComplianceState | "">("");
  const [chain, setChain] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminCompliance(
        {
          limit: ADMIN_PAGE_SIZE,
          offset,
          state: state || undefined,
          chainId: chain ? Number(chain) : undefined,
        },
        signal,
      ),
    [offset, state, chain],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  const openDialog = (kind: ActionKind, item: ComplianceCaseDto): void => {
    setNote("");
    setNotice("");
    setPending({ kind, item });
  };

  const trimmed = note.trim();

  const submit = async (): Promise<void> => {
    if (!pending || trimmed === "") return;
    const { kind, item } = pending;
    try {
      const act = kind === "shutdown" ? shutdownComplianceCase : resolveComplianceCase;
      await act(item.projectId, trimmed);
      toast.success(kind === "shutdown" ? "Project shut down" : "Case resolved");
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReloadKey((k) => k + 1);
        setNotice("Case is no longer open; list refreshed");
        return;
      }
      throw err;
    }
  };

  const isShutdown = pending?.kind === "shutdown";
  const refresh = () => setReloadKey((k) => k + 1);

  const columns: ReadonlyArray<DataTableColumn<ComplianceCaseDto>> = [
    {
      key: "project",
      header: "Project",
      cell: (c) => (
        <Link href={`/projects/${encodeURIComponent(c.projectId)}`} className="link-accent mono" style={{ fontSize: 12 }} title={c.projectId}>
          {shortProject(c.projectId)}
        </Link>
      ),
    },
    { key: "chain", header: "Network", cell: (c) => <span className="cell-sub" style={{ fontSize: 13 }}>{chainName(c.chainId)}</span> },
    { key: "state", header: "State", cell: (c) => <StatusPill tone={toneFromBadge(complianceBadge(c.state))}>{c.state}</StatusPill> },
    {
      key: "amounts",
      header: "Observed / routed",
      align: "right",
      cell: (c) =>
        c.observedNative != null && c.routedNative != null ? (
          <>
            <div className="cell-nowrap">
              <Amount value={formatNative(c.observedNative, c.chainId)} />
            </div>
            <div className="cell-nowrap admin-muted">
              / <Amount value={formatNative(c.routedNative, c.chainId)} />
            </div>
          </>
        ) : (
          <span className="cell-sub">-</span>
        ),
    },
    {
      key: "shortfall",
      header: "Shortfall",
      align: "right",
      numeric: true,
      cell: (c) => (c.shortfallBps != null ? <Amount value={formatBps(c.shortfallBps)} /> : <span className="cell-sub">-</span>),
    },
    { key: "checked", header: "Last checked", numeric: true, cell: (c) => <RelativeTime iso={c.lastCheckedAt} /> },
    {
      key: "window",
      header: "Window",
      cell: (c) => <WindowCell item={c} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) => (
        <div className="row-actions">
          {(c.state === "WARNED" || c.state === "ESCALATED") && (
            <Button variant="secondary" size="sm" onClick={() => openDialog("resolve", c)}>
              Resolve
            </Button>
          )}
          {c.state === "ESCALATED" && (
            <Button variant="danger" size="sm" onClick={() => openDialog("shutdown", c)}>
              Shut down
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section>
      <AdminPageHeader
        title="Compliance"
        description="Revenue audit cases comparing observed inflows with revenue routed to the protocol."
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <Card className="admin-toolbar">
        <StatusFilter
          options={STATES}
          value={state}
          label="State"
          onChange={(value) => {
            setState(value);
            setOffset(0);
          }}
        />
        <Field label="Network" className="toolbar-field">
          <Select
            value={chain}
            onChange={(e) => {
              setChain(CHAINS.map(String).find((c) => c === e.target.value) ?? "");
              setOffset(0);
            }}
          >
            <option value="">all networks</option>
            {CHAINS.map((c) => (
              <option key={c} value={String(c)}>{chainName(c)}</option>
            ))}
          </Select>
        </Field>
      </Card>
      {notice && (
        <InlineAlert tone="warning" className="panel-gap">
          {notice}
        </InlineAlert>
      )}
      <AdminListCard
        error={error}
        errorTitle="Could not load compliance cases"
        onRetry={refresh}
        hasData={page !== null}
        footer={<AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />}
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id}
          caption="Compliance cases"
          loading={loading}
          dense
          stickyHeader
          emptyTitle="No compliance cases."
        />
      </AdminListCard>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={isShutdown ? "Shut down project?" : "Resolve compliance case?"}
        body={
          isShutdown
            ? "The shutdown is recorded in the audit log and cannot be undone through the UI or API."
            : "This closes the case. If the shortfall persists, a new warning opens on the next check."
        }
        confirmLabel={isShutdown ? "Shut down" : "Resolve"}
        tone={isShutdown ? "danger" : "primary"}
        confirmDisabled={trimmed === ""}
        onConfirm={submit}
        errorFallback="Action failed"
      >
        <Field label="Note" required hint={trimmed === "" ? "A note is required to confirm." : `Up to ${NOTE_MAX} characters.`}>
          <Textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
