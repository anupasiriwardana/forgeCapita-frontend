"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { useAuth } from "@/components/web3/AuthProvider";
import { chainName } from "@/config/chains";
import {
  ApiError,
  cancelLaunchDraft,
  describeFounderError,
  listMyLaunchDrafts,
  shortAddr,
  type MyLaunchDraftDto,
} from "@/lib/api";

const REFRESH_MS = 15_000;

function badgeClass(status: string): string {
  if (status === "applied") return "badge-active";
  if (status === "pending" || status === "attached") return "badge-pending";
  return "badge-inactive";
}

function ProjectLink({ projectId, label }: { projectId: string | null; label: string }) {
  if (!projectId) return null;
  return (
    <Link href={`/projects/${encodeURIComponent(projectId)}`} style={{ color: "var(--brand-accent)" }}>
      {label}
    </Link>
  );
}

function Explanation({
  draft,
  busy,
  onCancel,
}: {
  draft: MyLaunchDraftDto;
  busy: boolean;
  onCancel: () => void;
}) {
  switch (draft.status) {
    case "pending":
      return (
        <>
          <p style={{ margin: "0 0 8px" }}>
            Waiting for the launch transaction. If you rejected it or closed the page, cancel to free your shadow wallet.
          </p>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        </>
      );
    case "attached":
      return (
        <>
          <p style={{ margin: 0 }}>
            On-chain. Waiting for the indexer; your profile is saved and will be applied automatically.
          </p>
          {draft.projectId && (
            <p style={{ fontSize: "12px", margin: "4px 0 0" }} title={draft.projectId}>
              Project id: {shortAddr(draft.projectId)}
            </p>
          )}
          <div style={{ marginTop: "4px" }}>
            <IndexerLagNote chainId={draft.chainId} />
          </div>
        </>
      );
    case "applied":
      return (
        <p style={{ margin: 0 }}>
          Live <ProjectLink projectId={draft.projectId} label="View project" />
        </p>
      );
    case "conflict":
      return (
        <p style={{ margin: 0 }}>
          A profile already exists for this project; open the project page to edit it.{" "}
          <ProjectLink projectId={draft.projectId} label="Open project" />
        </p>
      );
    case "cancelled":
      return <p style={{ margin: 0 }}>Cancelled</p>;
    case "expired":
      return <p style={{ margin: 0 }}>Expired</p>;
  }
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

  return (
    <>
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <button type="button" className="btn-secondary" onClick={reload}>Refresh</button>
        <Link href="/projects/create" style={{ color: "var(--brand-accent)", alignSelf: "center" }}>Launch a project</Link>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {items === null && !error && <p style={{ color: "var(--text-secondary)" }}>Loading…</p>}
      {items?.length === 0 && <p style={{ color: "var(--text-secondary)" }}>You have no launches yet.</p>}
      {items?.map((draft) => (
        <section key={draft.id} className="glass-card" style={{ padding: "20px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
            <strong>{draft.name}</strong>
            <span className={badgeClass(draft.status)}>{draft.status}</span>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 8px" }}>
            {chainName(draft.chainId)} · {new Date(draft.createdAt).toLocaleString()}
          </p>
          <Explanation draft={draft} busy={busyId === draft.id} onCancel={() => setCancelId(draft.id)} />
        </section>
      ))}
      <ConfirmDialog
        open={cancelId !== null}
        title="Cancel this launch?"
        confirmLabel="Cancel launch"
        cancelLabel="Keep launch"
        tone="danger"
        busy={busyId !== null}
        onConfirm={() => cancelId && void cancel(cancelId)}
        onCancel={() => setCancelId(null)}
      >
        Cancel this launch and free the shadow wallet? Only do this if the launch transaction was not sent.
      </ConfirmDialog>
    </>
  );
}

export default function LaunchesPage() {
  const { user, role, loading, signIn } = useAuth();
  let content: React.ReactNode;
  if (loading && !user) {
    content = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else if (!user) {
    content = (
      <div className="alert alert-warning" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span>Please sign in</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>Sign in</button>
      </div>
    );
  } else if (role !== "founder" && role !== "staff" && role !== "admin") {
    content = (
      <div className="alert alert-warning">
        Only founders have launches.{" "}
        <Link href="/apply" style={{ color: "var(--brand-accent)" }}>Apply here</Link>
      </div>
    );
  } else {
    content = <LaunchList />;
  }
  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>My launches</h1>
      {content}
    </div>
  );
}
