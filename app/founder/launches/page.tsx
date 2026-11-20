"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCw, Rocket } from "lucide-react";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { chainName } from "@/config/chains";
import { toast } from "@/lib/toast";
import {
  ApiError,
  cancelLaunchDraft,
  describeFounderError,
  listMyLaunchDrafts,
  shortAddr,
  type MyLaunchDraftDto,
} from "@/lib/api";

const REFRESH_MS = 15_000;

function statusTone(status: string): StatusTone {
  if (status === "applied") return "success";
  if (status === "pending" || status === "attached") return "warning";
  return "neutral";
}

function ProjectLink({ projectId, label }: { projectId: string | null; label: string }) {
  if (!projectId) return null;
  return (
    <ButtonLink href={`/projects/${encodeURIComponent(projectId)}`} variant="ghost" size="sm">
      {label}
    </ButtonLink>
  );
}

function Explanation({ draft }: { draft: MyLaunchDraftDto }) {
  switch (draft.status) {
    case "pending":
      return <>Waiting for the launch transaction. If you rejected it or closed the page, cancel to free your shadow wallet.</>;
    case "attached":
      return (
        <>
          On-chain. Waiting for the indexer; your profile is saved and will be applied automatically.
          {draft.projectId && (
            <div className="mono" style={{ marginTop: 4 }} title={draft.projectId}>
              Project id: {shortAddr(draft.projectId)}
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <IndexerLagNote chainId={draft.chainId} />
          </div>
        </>
      );
    case "applied":
      return <>Live</>;
    case "conflict":
      return <>A profile already exists for this project; open the project page to edit it.</>;
    case "cancelled":
      return <>Cancelled</>;
    case "expired":
      return <>Expired</>;
  }
}

function DraftActions({ draft, busy, onCancel }: { draft: MyLaunchDraftDto; busy: boolean; onCancel: () => void }) {
  return (
    <div className="row-actions">
      {draft.status === "pending" && (
        <Button variant="secondary" size="sm" loading={busy} onClick={onCancel}>
          Cancel
        </Button>
      )}
      {draft.status === "applied" && <ProjectLink projectId={draft.projectId} label="View project" />}
      {draft.status === "conflict" && <ProjectLink projectId={draft.projectId} label="Open project" />}
    </div>
  );
}

function LaunchList() {
  const [items, setItems] = useState<MyLaunchDraftDto[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listMyLaunchDrafts(signal)
      .then((list) => {
        if (signal.aborted) return;
        setItems([...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load your launches"));
      });
    return () => controller.abort();
  }, [reloadKey]);

  const active = items?.some((d) => d.status === "pending" || d.status === "attached") ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, reload]);

  async function cancel(id: string): Promise<void> {
    setBusyId(id);
    setError("");
    try {
      await cancelLaunchDraft(id);
      toast.success("Launch cancelled", { description: "The shadow wallet is free again." });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) {
        setError(describeFounderError(err, "Could not cancel the draft"));
      }
    } finally {
      setBusyId(null);
      setCancelId(null);
      reload();
    }
  }

  const columns: ReadonlyArray<DataTableColumn<MyLaunchDraftDto>> = [
    {
      key: "name",
      header: "Project",
      cell: (d) => (
        <div style={{ maxWidth: 420 }}>
          <span className="cell-title">{d.name}</span>
          <div className="cell-sub">
            <Explanation draft={d} />
          </div>
        </div>
      ),
    },
    { key: "chain", header: "Chain", cell: (d) => <span className="cell-sub" style={{ fontSize: 13 }}>{chainName(d.chainId)}</span> },
    { key: "status", header: "Status", cell: (d) => <StatusPill tone={statusTone(d.status)}>{d.status}</StatusPill> },
    {
      key: "created",
      header: "Created",
      numeric: true,
      cell: (d) => <span className="cell-sub" style={{ fontSize: 13 }}>{new Date(d.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (d) => <DraftActions draft={d} busy={busyId === d.id} onCancel={() => setCancelId(d.id)} />,
    },
  ];

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>My launches</h1>
          <p>Launch drafts you started, newest first. Active drafts refresh automatically.</p>
        </div>
        <div className="page-title-actions">
          <Button variant="secondary" size="sm" onClick={reload} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
          <ButtonLink href="/founder/launch" size="sm" leftIcon={<Plus size={14} aria-hidden="true" />}>
            Launch a project
          </ButtonLink>
        </div>
      </div>
      {error && items !== null && (
        <InlineAlert tone="danger" className="panel-gap">
          {error}
        </InlineAlert>
      )}
      <Card>
        {error && items === null ? (
          <ErrorState title="Could not load your launches" message={error} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={items ?? []}
            rowKey={(d) => d.id}
            caption="My launch drafts"
            loading={items === null}
            skeletonRows={3}
            emptyTitle="You have no launches yet."
            emptyText="Launch a project to see its draft and status here."
            emptyAction={<ButtonLink href="/founder/launch" leftIcon={<Rocket size={14} aria-hidden="true" />}>Launch project</ButtonLink>}
          />
        )}
      </Card>
      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(open) => {
          if (!open) setCancelId(null);
        }}
        title="Cancel this launch?"
        body="Cancel this launch and free the shadow wallet? Only do this if the launch transaction was not sent."
        confirmLabel="Cancel launch"
        cancelLabel="Keep launch"
        tone="danger"
        onConfirm={async () => {
          if (cancelId) await cancel(cancelId);
        }}
      />
    </>
  );
}

export default function LaunchesPage() {
  return <LaunchList />;
}
