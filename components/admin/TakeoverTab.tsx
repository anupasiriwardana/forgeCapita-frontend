"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { SUPPORTED_CHAINS, chainName } from "@/config/chains";
import {
  ApiError,
  cancelTakeoverCase,
  closeTakeoverCase,
  describeApiError,
  getTakeoverDetail,
  listTakeoverCases,
  listTakeoverVotes,
  openTakeoverCase,
  prepareTakeoverCase,
  shortAddr,
  type Page,
  type TakeoverCaseDto,
  type TakeoverDetailDto,
  type TakeoverStatus,
  type TakeoverVoteDto,
  type UserRole,
} from "@/lib/api";
import { formatTokenAmount } from "@/lib/format";
import { ADMIN_PAGE_SIZE, AdminPager, ListState, ROW_STYLE, useAdminList } from "./shared";
import { TakeoverExecution } from "./TakeoverExecution";
import { TakeoverHandover } from "./TakeoverHandover";

const STATUSES: TakeoverStatus[] = ["prepared", "vote_open", "closed", "cancelled"];
const COLUMNS = "1.4fr 1.1fr 0.9fr 0.9fr 1.4fr 0.6fr 0.6fr";
const ADDRESS_INPUT = /^0x[0-9a-fA-F]{40}$/;
const MAX_REASON = 2000;
const MAX_LINKS = 10;
const MAX_LINK_LENGTH = 500;

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseLinks(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function linkProblem(links: string[]): string {
  if (links.length > MAX_LINKS) return `At most ${MAX_LINKS} evidence links`;
  for (const link of links) {
    if (link.length > MAX_LINK_LENGTH) return `Each evidence link must be at most ${MAX_LINK_LENGTH} characters`;
    if (!isHttps(link)) return "Evidence links must be https URLs";
  }
  return "";
}

function statusBadge(status: TakeoverStatus): string {
  return status === "vote_open" ? "badge-active" : status === "prepared" ? "badge-pending" : "badge-inactive";
}

function projectLabel(c: TakeoverCaseDto): string {
  return `${chainName(c.chainId)} ${shortAddr(c.projectId.split(":")[1] ?? c.projectId)}`;
}

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function actionErrorMessage(err: unknown, action: "open" | "cancel" | "close" | "prepare"): string {
  if (err instanceof ApiError) {
    if (action === "open" && err.status === 503) return "Indexer unavailable or lagging; the case stays prepared";
    if (err.status === 409 || err.status === 422) return err.message;
  }
  return describeApiError(err, "Action failed");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "13px", wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

function PrepareForm({ onCreated }: { onCreated: () => void }) {
  const [chainId, setChainId] = useState<number>(SUPPORTED_CHAINS[0].id);
  const [project, setProject] = useState("");
  const [candidate, setCandidate] = useState("");
  const [reason, setReason] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (): Promise<void> => {
    if (busy) return;
    const projectAddress = project.trim();
    const candidateWallet = candidate.trim();
    const trimmedReason = reason.trim();
    const evidenceLinks = parseLinks(links);
    setSuccess("");
    if (!ADDRESS_INPUT.test(projectAddress)) return setError("Project escrow address must be 0x followed by 40 hex characters");
    if (!ADDRESS_INPUT.test(candidateWallet)) return setError("Candidate wallet must be 0x followed by 40 hex characters");
    if (trimmedReason === "" || trimmedReason.length > MAX_REASON) return setError(`Reason is required (up to ${MAX_REASON} characters)`);
    const problem = linkProblem(evidenceLinks);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      await prepareTakeoverCase({
        chainId,
        projectAddress: projectAddress.toLowerCase(),
        candidateWallet: candidateWallet.toLowerCase(),
        reason: trimmedReason,
        evidenceLinks,
      });
      setProject("");
      setCandidate("");
      setReason("");
      setLinks("");
      setSuccess("Case prepared. It opens for voting only after the candidate accepts and an admin opens it.");
      onCreated();
    } catch (err) {
      setError(actionErrorMessage(err, "prepare"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: "16px", marginBottom: "16px", display: "grid", gap: "10px" }}>
      <h3 style={{ fontSize: "16px" }}>Prepare a takeover case</h3>
      <select className="input-field" value={chainId} onChange={(e) => setChainId(Number(e.target.value))} aria-label="Chain">
        {SUPPORTED_CHAINS.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input className="input-field" placeholder="Project escrow address (0x…)" maxLength={42} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project escrow address" />
      <input className="input-field" placeholder="Candidate wallet (0x…)" maxLength={42} value={candidate} onChange={(e) => setCandidate(e.target.value)} aria-label="Candidate wallet" />
      <textarea className="input-field" rows={3} maxLength={MAX_REASON} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
      <textarea className="input-field" rows={3} placeholder="Evidence links, one https URL per line (optional)" value={links} onChange={(e) => setLinks(e.target.value)} aria-label="Evidence links" />
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {success && <div role="status" className="alert alert-success">{success}</div>}
      <div>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Preparing…" : "Prepare case"}
        </button>
      </div>
    </div>
  );
}

type Action = "open" | "cancel" | "close";

function VotesTable({ id }: { id: string }) {
  const [shown, setShown] = useState(false);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<TakeoverVoteDto> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    const { signal } = controller;
    listTakeoverVotes(id, { limit: ADMIN_PAGE_SIZE, offset }, signal)
      .then((p) => {
        if (signal.aborted) return;
        setPage(p);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load votes"));
      });
    return () => controller.abort();
  }, [shown, id, offset]);

  if (!shown) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setShown(true)}>
        Load votes
      </button>
    );
  }
  return (
    <div>
      <h4 style={{ fontSize: "14px", marginBottom: "6px" }}>Votes</h4>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {page && page.items.length === 0 && <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>No votes yet.</p>}
      {page?.items.map((v) => (
        <div key={v.voter} style={{ ...ROW_STYLE, gridTemplateColumns: "1.5fr 0.6fr 1fr 1.4fr" }}>
          <span title={v.voter}>{shortAddr(v.voter)}</span>
          <span>{v.choice}</span>
          <span>{formatTokenAmount(v.weight)}</span>
          <span style={{ color: "var(--text-secondary)" }}>{when(v.updatedAt)}</span>
        </div>
      ))}
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
    </div>
  );
}

function CaseDetail({ id, role, onChanged }: { id: string; role: UserRole; onChanged: () => void }) {
  const [detail, setDetail] = useState<TakeoverDetailDto | null>(null);
  const [now, setNow] = useState(0);
  const [holdersOffset, setHoldersOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    getTakeoverDetail(id, { limit: ADMIN_PAGE_SIZE, offset: holdersOffset }, signal)
      .then((d) => {
        if (signal.aborted) return;
        setDetail(d);
        setNow(Date.now());
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load case"));
      });
    return () => controller.abort();
  }, [id, holdersOffset, reloadKey]);

  const run = async (action: Action): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      if (action === "open") await openTakeoverCase(id);
      else if (action === "cancel") await cancelTakeoverCase(id);
      else await closeTakeoverCase(id);
      setNotice(action === "open" ? "Voting is open" : action === "cancel" ? "Case cancelled" : "Case closed");
      setPending(null);
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (err) {
      setActionError(actionErrorMessage(err, action));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div role="alert" className="alert alert-error">{error}</div>;
  if (!detail) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;

  const c = detail.case;
  const isAdmin = role === "admin";
  const ended = c.endsAt !== null && Date.parse(c.endsAt) <= now;
  const holdersTotal = c.snapshotHolderCount ?? 0;

  return (
    <div className="glass-card" style={{ padding: "20px", marginTop: "16px" }}>
      <IndexerLagNote chainId={c.chainId} />
      <Field label="Project">{c.projectId}</Field>
      <Field label="Candidate">{c.candidateWallet}</Field>
      <Field label="Reason"><span style={{ whiteSpace: "pre-wrap" }}>{c.reason}</span></Field>
      <Field label="Evidence">
        {c.evidenceLinks.length === 0 && "None"}
        {c.evidenceLinks.map((link) =>
          isHttps(link) ? (
            <div key={link}>
              <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)", wordBreak: "break-all" }}>
                {link}
              </a>
            </div>
          ) : (
            <div key={link}>{link}</div>
          ),
        )}
      </Field>
      <Field label="Candidate accepted">{when(c.candidateAcceptedAt)}</Field>
      <Field label="Developer at open">{c.developerAtOpen ?? "-"}</Field>
      <Field label="Snapshot">
        {c.snapshotBlock === null
          ? "Not taken yet"
          : `block ${c.snapshotBlock}, total staked ${formatTokenAmount(c.snapshotTotalStaked ?? "0")}, ${holdersTotal} holders, indexer lag ${c.snapshotLagSeconds ?? "-"}s`}
      </Field>
      <Field label="Voting window ends">{when(c.endsAt)}</Field>
      <Field label="Tally">
        {c.votedWeight === null
          ? "-"
          : `yes ${formatTokenAmount(c.yesWeight ?? "0")}, no ${formatTokenAmount(c.noWeight ?? "0")}, voted ${formatTokenAmount(c.votedWeight)} by ${c.voterCount ?? 0} voters, quorum ${c.quorumPercent ?? "-"}%`}
        {c.result && ` (result: ${c.result})`}
      </Field>

      {notice && <div role="status" className="alert alert-success" style={{ marginBottom: "12px" }}>{notice}</div>}
      {actionError && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{actionError}</div>}
      {isAdmin && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {c.status === "prepared" && (
            <>
              <button type="button" className="btn-primary" disabled={busy || c.candidateAcceptedAt === null} onClick={() => setPending("open")}>
                Open vote
              </button>
              {c.candidateAcceptedAt === null && (
                <span style={{ fontSize: "12px", color: "var(--text-muted)", alignSelf: "center" }}>Waiting for the candidate to accept</span>
              )}
            </>
          )}
          {(c.status === "prepared" || c.status === "vote_open") && (
            <button type="button" className="btn-danger" disabled={busy} onClick={() => setPending("cancel")}>
              Cancel case
            </button>
          )}
          {c.status === "vote_open" && (
            <button type="button" className="btn-secondary" disabled={busy || !ended} onClick={() => setPending("close")}>
              Close vote
            </button>
          )}
        </div>
      )}

      <TakeoverExecution c={c} onSent={() => setReloadKey((k) => k + 1)} />
      <TakeoverHandover c={c} role={role} onChanged={() => setReloadKey((k) => k + 1)} />

      <h4 style={{ fontSize: "14px", marginBottom: "6px" }}>Snapshot holders</h4>
      {detail.holders.items.length === 0 && <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>No snapshot holders.</p>}
      {detail.holders.items.map((h) => (
        <div key={h.investorAddress} style={{ ...ROW_STYLE, gridTemplateColumns: "1.5fr 1fr 1fr" }}>
          <span title={h.investorAddress}>{shortAddr(h.investorAddress)}</span>
          <span>staked {formatTokenAmount(h.stakedBalance)}</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {h.unstakedBalance === null ? "unstaked n/a" : `unstaked ~${formatTokenAmount(h.unstakedBalance)}`}
          </span>
        </div>
      ))}
      <AdminPager offset={holdersOffset} total={holdersTotal} onChange={setHoldersOffset} />
      <div style={{ marginTop: "16px" }}>
        <VotesTable id={id} />
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending === "open" ? "Open the vote?" : pending === "cancel" ? "Cancel this case?" : "Close the vote?"}
        confirmLabel={pending === "open" ? "Open vote" : pending === "cancel" ? "Cancel case" : "Close vote"}
        tone={pending === "cancel" ? "danger" : "default"}
        busy={busy}
        onConfirm={() => pending && void run(pending)}
        onCancel={() => setPending(null)}
      >
        {pending === "open" && (
          <p>
            A snapshot of staked balances is frozen now. A voting window of about 7 days starts (the exact end time is
            shown after opening). The vote is advisory. The current developer and the candidate cannot vote.
          </p>
        )}
        {pending === "cancel" && <p>The case is cancelled and cannot be reopened. This is recorded in the audit log.</p>}
        {pending === "close" && <p>The voting window has ended. Closing computes and records the result.</p>}
      </ConfirmDialog>
    </div>
  );
}

export function TakeoverTab({ role }: { role: UserRole }) {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<TakeoverStatus | "">("");
  const [chainId, setChainId] = useState<number | "">("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(
    (signal: AbortSignal) =>
      listTakeoverCases({ status: status || undefined, chainId: chainId || undefined, limit: ADMIN_PAGE_SIZE, offset }, signal),
    [status, chainId, offset],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];
  const refresh = (): void => setReloadKey((k) => k + 1);

  return (
    <section>
      <h1 style={{ fontSize: "22px", marginBottom: "16px" }}>Takeover</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
        Advisory votes on replacing a project developer. Staff prepare cases; admins open and close them.
      </p>
      <PrepareForm onCreated={refresh} />
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ width: "180px" }}
          value={status}
          onChange={(e) => {
            setStatus(STATUSES.find((s) => s === e.target.value) ?? "");
            setOffset(0);
          }}
          aria-label="Filter by status"
        >
          <option value="">all statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="input-field"
          style={{ width: "180px" }}
          value={chainId}
          onChange={(e) => {
            setChainId(SUPPORTED_CHAINS.find((c) => String(c.id) === e.target.value)?.id ?? "");
            setOffset(0);
          }}
          aria-label="Filter by chain"
        >
          <option value="">all chains</option>
          {SUPPORTED_CHAINS.map((c) => (
            <option key={c.id} value={c.id}>{chainName(c.id)}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </div>
      <div className="glass-card" style={{ padding: "8px" }}>
        <ListState loading={loading} error={error} empty={items.length === 0} emptyText="No takeover cases." />
        {items.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedId(c.id)}
            style={{
              ...ROW_STYLE,
              gridTemplateColumns: COLUMNS,
              width: "100%",
              textAlign: "left",
              background: c.id === selectedId ? "rgba(99,102,241,0.12)" : "transparent",
              border: "none",
              borderBottom: "1px solid var(--border)",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <span title={c.projectId}>{projectLabel(c)}</span>
            <span title={c.candidateWallet}>{shortAddr(c.candidateWallet)}</span>
            <span><span className={`badge ${statusBadge(c.status)}`}>{c.status}</span></span>
            <span>{c.result ?? "-"}</span>
            <span style={{ color: "var(--text-secondary)" }}>{when(c.endsAt)}</span>
            <span>{c.voterCount ?? "-"}</span>
            <span>{c.quorumPercent === null ? "-" : `${c.quorumPercent}%`}</span>
          </button>
        ))}
      </div>
      <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
      {selectedId && <CaseDetail key={selectedId} id={selectedId} role={role} onChanged={refresh} />}
    </section>
  );
}
