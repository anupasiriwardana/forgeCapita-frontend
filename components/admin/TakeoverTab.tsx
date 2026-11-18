"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { toast } from "@/lib/toast";
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
  type TakeoverHolderDto,
  type TakeoverStatus,
  type TakeoverVoteDto,
  type UserRole,
} from "@/lib/api";
import { formatTokenAmount } from "@/lib/format";
import {
  ADMIN_PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager,
  RelativeTime,
  Row,
  StatusFilter,
  statusLabel,
  toneFromBadge,
  useAdminList,
} from "./shared";
import { TakeoverExecution } from "./TakeoverExecution";
import { TakeoverHandover } from "./TakeoverHandover";

const STATUSES: TakeoverStatus[] = ["prepared", "vote_open", "closed", "cancelled"];
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

function PrepareDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [chainId, setChainId] = useState<number>(SUPPORTED_CHAINS[0].id);
  const [project, setProject] = useState("");
  const [candidate, setCandidate] = useState("");
  const [reason, setReason] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    if (busy) return;
    const projectAddress = project.trim();
    const candidateWallet = candidate.trim();
    const trimmedReason = reason.trim();
    const evidenceLinks = parseLinks(links);
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
      toast.success("Case prepared", { description: "It opens for voting only after the candidate accepts and an admin opens it." });
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(actionErrorMessage(err, "prepare"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setError("");
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Prepare a takeover case"
        description="The case opens for voting only after the candidate accepts and an admin opens it."
        maxWidth={560}
        hideClose={busy}
        preventDismiss={busy}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {busy ? "Preparing…" : "Prepare case"}
            </Button>
          </>
        }
      >
        <div className="stack-md">
          <Field label="Chain">
            <Select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
              {SUPPORTED_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Project escrow address" required>
            <Input
              className="mono"
              placeholder="0x…"
              maxLength={42}
              spellCheck={false}
              autoComplete="off"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </Field>
          <Field label="Candidate wallet" required>
            <Input
              className="mono"
              placeholder="0x…"
              maxLength={42}
              spellCheck={false}
              autoComplete="off"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            />
          </Field>
          <Field label="Reason" required hint={`Up to ${MAX_REASON} characters.`}>
            <Textarea rows={3} maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Evidence links" hint={`Optional. One https URL per line, at most ${MAX_LINKS}.`}>
            <Textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} />
          </Field>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Action = "open" | "cancel" | "close";

const VOTE_COLUMNS: ReadonlyArray<DataTableColumn<TakeoverVoteDto>> = [
  { key: "voter", header: "Voter", cell: (v) => <AddressChip address={v.voter} /> },
  { key: "choice", header: "Choice", cell: (v) => statusLabel(v.choice) },
  { key: "weight", header: "Weight", align: "right", numeric: true, cell: (v) => <Amount value={formatTokenAmount(v.weight)} /> },
  { key: "updated", header: "Updated", numeric: true, cell: (v) => <RelativeTime iso={v.updatedAt} /> },
];

const HOLDER_COLUMNS: ReadonlyArray<DataTableColumn<TakeoverHolderDto>> = [
  { key: "investor", header: "Investor", cell: (h) => <AddressChip address={h.investorAddress} /> },
  { key: "staked", header: "Staked", align: "right", numeric: true, cell: (h) => <Amount value={formatTokenAmount(h.stakedBalance)} /> },
  {
    key: "unstaked",
    header: "Unstaked",
    align: "right",
    numeric: true,
    cell: (h) =>
      h.unstakedBalance === null ? <span className="cell-sub">n/a</span> : <Amount value={`~${formatTokenAmount(h.unstakedBalance)}`} />,
  },
];

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
      <Button variant="secondary" size="sm" onClick={() => setShown(true)}>
        Load votes
      </Button>
    );
  }
  return (
    <div>
      {error && (
        <InlineAlert tone="danger" className="panel-gap">
          {error}
        </InlineAlert>
      )}
      <div className="admin-subtable">
        <DataTable
          columns={VOTE_COLUMNS}
          rows={page?.items ?? []}
          rowKey={(v) => v.voter}
          caption="Votes"
          loading={page === null && !error}
          skeletonRows={3}
          dense
          emptyTitle="No votes yet."
        />
      </div>
      <div className="admin-pager-inline">
        <AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />
      </div>
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
    if (action === "open") await openTakeoverCase(id);
    else if (action === "cancel") await cancelTakeoverCase(id);
    else await closeTakeoverCase(id);
    toast.success(action === "open" ? "Voting is open" : action === "cancel" ? "Case cancelled" : "Case closed");
    setReloadKey((k) => k + 1);
    onChanged();
  };

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!detail) {
    return (
      <div className="stack-sm" role="status">
        <Skeleton width="40%" />
        <Skeleton width="70%" />
        <Skeleton width="55%" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  const c = detail.case;
  const isAdmin = role === "admin";
  const ended = c.endsAt !== null && Date.parse(c.endsAt) <= now;
  const holdersTotal = c.snapshotHolderCount ?? 0;

  return (
    <div>
      <IndexerLagNote chainId={c.chainId} />
      <dl className="admin-detail" style={{ marginTop: 12 }}>
        <Row label="Status">
          <StatusPill tone={toneFromBadge(statusBadge(c.status))}>{statusLabel(c.status)}</StatusPill>
        </Row>
        <Row label="Voting window ends">{when(c.endsAt)}</Row>
        <Row label="Project" wide>
          <span className="mono">{c.projectId}</span>
        </Row>
        <Row label="Candidate" wide>
          <span className="mono">{c.candidateWallet}</span>
        </Row>
        <Row label="Reason" wide>
          <span className="admin-detail-pre">{c.reason}</span>
        </Row>
        <Row label="Evidence" wide>
          {c.evidenceLinks.length === 0 && "None"}
          {c.evidenceLinks.map((link) =>
            isHttps(link) ? (
              <div key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer" className="link-accent text-wrap">
                  {link}
                </a>
              </div>
            ) : (
              <div key={link}>{link}</div>
            ),
          )}
        </Row>
        <Row label="Candidate accepted">{when(c.candidateAcceptedAt)}</Row>
        <Row label="Developer at open">{c.developerAtOpen ? <span className="mono">{c.developerAtOpen}</span> : "-"}</Row>
        <Row label="Snapshot" wide>
          {c.snapshotBlock === null
            ? "Not taken yet"
            : `block ${c.snapshotBlock}, total staked ${formatTokenAmount(c.snapshotTotalStaked ?? "0")}, ${holdersTotal} holders, indexer lag ${c.snapshotLagSeconds ?? "-"}s`}
        </Row>
        <Row label="Tally" wide>
          {c.votedWeight === null
            ? "-"
            : `yes ${formatTokenAmount(c.yesWeight ?? "0")}, no ${formatTokenAmount(c.noWeight ?? "0")}, voted ${formatTokenAmount(c.votedWeight)} by ${c.voterCount ?? 0} voters, quorum ${c.quorumPercent ?? "-"}%`}
          {c.result && ` (result: ${c.result})`}
        </Row>
      </dl>

      {isAdmin && (c.status === "prepared" || c.status === "vote_open") && (
        <div className="admin-section">
          <h3 className="admin-section-title">Admin actions</h3>
          <div className="admin-actions">
            {c.status === "prepared" && (
              <>
                <Button disabled={c.candidateAcceptedAt === null} onClick={() => setPending("open")}>
                  Open vote
                </Button>
                {c.candidateAcceptedAt === null && <span className="panel-note">Waiting for the candidate to accept</span>}
              </>
            )}
            {c.status === "vote_open" && (
              <Button variant="secondary" disabled={!ended} onClick={() => setPending("close")}>
                Close vote
              </Button>
            )}
            <Button variant="danger" onClick={() => setPending("cancel")}>
              Cancel case
            </Button>
          </div>
        </div>
      )}

      <TakeoverExecution c={c} onSent={() => setReloadKey((k) => k + 1)} />
      <TakeoverHandover c={c} role={role} onChanged={() => setReloadKey((k) => k + 1)} />

      <div className="admin-section">
        <h3 className="admin-section-title">Snapshot holders</h3>
        <div className="admin-subtable">
          <DataTable
            columns={HOLDER_COLUMNS}
            rows={detail.holders.items}
            rowKey={(h) => h.investorAddress}
            caption="Snapshot holders"
            dense
            emptyTitle="No snapshot holders."
          />
        </div>
        <div className="admin-pager-inline">
          <AdminPager offset={holdersOffset} total={holdersTotal} onChange={setHoldersOffset} />
        </div>
      </div>
      <div className="admin-section">
        <h3 className="admin-section-title">Votes</h3>
        <VotesTable id={id} />
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending === "open" ? "Open the vote?" : pending === "cancel" ? "Cancel this case?" : "Close the vote?"}
        body={
          pending === "open"
            ? "A snapshot of staked balances is frozen now. A voting window of about 7 days starts (the exact end time is shown after opening). The vote is advisory. The current developer and the candidate cannot vote."
            : pending === "cancel"
              ? "The case is cancelled and cannot be reopened. This is recorded in the audit log."
              : "The voting window has ended. Closing computes and records the result."
        }
        confirmLabel={pending === "open" ? "Open vote" : pending === "cancel" ? "Cancel case" : "Close vote"}
        cancelLabel="Back"
        tone={pending === "cancel" ? "danger" : "primary"}
        onConfirm={async () => {
          if (pending) await run(pending);
        }}
        describeError={(err) => actionErrorMessage(err, pending ?? "open")}
      />
    </div>
  );
}

export function TakeoverTab({ role }: { role: UserRole }) {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<TakeoverStatus | "">("");
  const [chainId, setChainId] = useState<number | "">("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(
    (signal: AbortSignal) =>
      listTakeoverCases({ status: status || undefined, chainId: chainId || undefined, limit: ADMIN_PAGE_SIZE, offset }, signal),
    [status, chainId, offset],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];
  const refresh = (): void => setReloadKey((k) => k + 1);

  const columns: ReadonlyArray<DataTableColumn<TakeoverCaseDto>> = [
    { key: "project", header: "Project", cell: (c) => <span className="mono" style={{ fontSize: 12 }} title={c.projectId}>{projectLabel(c)}</span> },
    { key: "candidate", header: "Candidate", cell: (c) => <AddressChip address={c.candidateWallet} /> },
    { key: "status", header: "Status", cell: (c) => <StatusPill tone={toneFromBadge(statusBadge(c.status))}>{statusLabel(c.status)}</StatusPill> },
    { key: "result", header: "Result", cell: (c) => (c.result ? statusLabel(c.result) : <span className="cell-sub">-</span>) },
    { key: "ends", header: "Ends", numeric: true, cell: (c) => <span className="cell-sub" style={{ fontSize: 13 }}>{when(c.endsAt)}</span> },
    { key: "voters", header: "Voters", align: "right", numeric: true, cell: (c) => c.voterCount ?? "-" },
    { key: "quorum", header: "Quorum", align: "right", numeric: true, cell: (c) => (c.quorumPercent === null ? "-" : `${c.quorumPercent}%`) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) => (
        <Button variant="secondary" size="sm" onClick={() => setSelectedId(c.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <section>
      <AdminPageHeader
        title="Takeover"
        description="Advisory votes on replacing a project developer. Staff prepare cases; admins open and close them."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
              Refresh
            </Button>
            <Button size="sm" onClick={() => setPreparing(true)} leftIcon={<Plus size={14} aria-hidden="true" />}>
              Prepare case
            </Button>
          </>
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
        <Field label="Chain" className="toolbar-field">
          <Select
            value={chainId}
            onChange={(e) => {
              setChainId(SUPPORTED_CHAINS.find((c) => String(c.id) === e.target.value)?.id ?? "");
              setOffset(0);
            }}
          >
            <option value="">all chains</option>
            {SUPPORTED_CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{chainName(c.id)}</option>
            ))}
          </Select>
        </Field>
      </Card>
      <AdminListCard
        error={error}
        errorTitle="Could not load takeover cases"
        onRetry={refresh}
        hasData={page !== null}
        footer={<AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />}
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id}
          caption="Takeover cases"
          loading={loading}
          dense
          stickyHeader
          emptyTitle="No takeover cases."
        />
      </AdminListCard>

      <PrepareDialog open={preparing} onOpenChange={setPreparing} onCreated={refresh} />
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          title="Takeover case"
          description="Case details, admin actions, on-chain execution, repository handover, snapshot holders and votes."
          maxWidth={880}
        >
          {selectedId && <CaseDetail key={selectedId} id={selectedId} role={role} onChanged={refresh} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
