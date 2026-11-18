"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RotateCw, Zap } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { chainName } from "@/config/chains";
import {
  fetchRelayStatus,
  listAdminRelayRequests,
  shortAddr,
  type AdminRelayRequestDto,
  type RelayBalanceBucket,
  type RelayKind,
  type RelayRequestStatus,
  type RelayStatusDto,
} from "@/lib/api";
import {
  ADMIN_PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager,
  RelativeTime,
  StatusFilter,
  statusLabel,
  toneFromBadge,
  truncate,
  useAdminList,
} from "./shared";
import { explorerTxUrl } from "@/lib/explorer";

const KINDS: RelayKind[] = ["claim", "stake", "vote", "execute"];
const STATUSES: RelayRequestStatus[] = ["QUEUED", "SENDING", "SENT", "CONFIRMED", "FAILED", "EXPIRED"];
const CHAINS = [421614, 97];
const POLL_MS = 30_000;

function requestBadge(status: RelayRequestStatus): string {
  if (status === "CONFIRMED") return "badge-active";
  if (status === "FAILED" || status === "EXPIRED") return "badge-inactive";
  return "badge-pending";
}

function balanceBadge(balance: RelayBalanceBucket): string {
  if (balance === "ok") return "badge-active";
  if (balance === "unknown") return "badge-pending";
  return "badge-inactive";
}

function errorText(r: AdminRelayRequestDto): string {
  return [r.errorCode, r.errorMessage].filter((v): v is string => Boolean(v)).join(": ");
}

const COLUMNS: ReadonlyArray<DataTableColumn<AdminRelayRequestDto>> = [
  { key: "created", header: "Created", numeric: true, cell: (r) => <RelativeTime iso={r.createdAt} /> },
  { key: "kind", header: "Kind", cell: (r) => <span style={{ fontSize: 13 }}>{statusLabel(r.kind)}</span> },
  { key: "chain", header: "Network", cell: (r) => <span className="cell-sub" style={{ fontSize: 13 }}>{chainName(r.chainId)}</span> },
  {
    key: "project",
    header: "Project",
    cell: (r) => (
      <Link href={`/projects/${encodeURIComponent(r.projectId)}`} className="link-accent mono" style={{ fontSize: 12 }} title={r.projectId}>
        {shortAddr(r.projectId.split(":")[1] ?? r.projectId)}
      </Link>
    ),
  },
  { key: "account", header: "Account", cell: (r) => <AddressChip address={r.account} /> },
  { key: "status", header: "Status", cell: (r) => <StatusPill tone={toneFromBadge(requestBadge(r.status))}>{statusLabel(r.status)}</StatusPill> },
  {
    key: "error",
    header: "Error",
    cell: (r) => {
      const text = errorText(r);
      return text ? (
        <span className="cell-sub text-wrap" style={{ display: "block", maxWidth: 260 }} title={text}>
          {truncate(text, 60)}
        </span>
      ) : (
        <span className="cell-sub">-</span>
      );
    },
  },
  {
    key: "tx",
    header: "Transaction",
    cell: (r) => {
      const txUrl = r.txHash ? explorerTxUrl(r.chainId, r.txHash) : null;
      return r.txHash && txUrl ? (
        <a href={txUrl} target="_blank" rel="noopener noreferrer" className="link-accent mono" style={{ fontSize: 12 }} title={r.txHash}>
          {shortAddr(r.txHash)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="cell-sub">-</span>
      );
    },
  },
];

function RelayerHealth({ reloadKey }: { reloadKey: number }) {
  const [state, setState] = useState<{ reloadKey: number; status: RelayStatusDto | null; error: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchRelayStatus(signal)
      .then((status) => {
        if (!signal.aborted) setState({ reloadKey, status, error: false });
      })
      .catch(() => {
        if (!signal.aborted) setState({ reloadKey, status: null, error: true });
      });
    return () => controller.abort();
  }, [reloadKey]);

  const chains = state?.status?.chains ?? [];
  const warn = chains.some((c) => c.enabled && (c.balance === "low" || c.balance === "empty"));

  return (
    <section aria-label="Relayer status" className="admin-kpis">
      {warn && (
        <InlineAlert tone="warning" className="panel-gap">
          A relayer wallet balance is low or empty.
        </InlineAlert>
      )}
      {state?.error && (
        <InlineAlert tone="warning" className="panel-gap">
          Status unavailable
        </InlineAlert>
      )}
      <div className="kpi-grid" style={{ marginBottom: 0 }}>
        {state === null && (
          <>
            <StatCard label="Relayer status" value="" loading />
            <StatCard label="Relayer status" value="" loading />
          </>
        )}
        {chains.map((c) => (
          <StatCard
            key={c.chainId}
            label={chainName(c.chainId)}
            icon={<Zap size={16} />}
            value={
              c.enabled ? (
                <span className="relay-health">
                  <StatusPill tone={toneFromBadge(balanceBadge(c.balance ?? "unknown"))}>
                    Balance: {c.balance ?? "unknown"}
                  </StatusPill>
                </span>
              ) : (
                <span className="relay-health">
                  <StatusPill tone="neutral">Disabled</StatusPill>
                </span>
              )
            }
            hint={
              c.enabled ? (
                c.relayerAddress ? (
                  <>
                    Relayer <AddressChip address={c.relayerAddress} />
                  </>
                ) : (
                  "Relayer -"
                )
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

export function RelayTab() {
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<RelayKind | "">("");
  const [status, setStatus] = useState<RelayRequestStatus | "">("");
  const [chain, setChain] = useState("");
  const [systemOnly, setSystemOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setReloadKey((k) => k + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminRelayRequests(
        {
          limit: ADMIN_PAGE_SIZE,
          offset,
          kind: kind || undefined,
          status: status || undefined,
          chainId: chain ? Number(chain) : undefined,
          system: systemOnly ? "true" : undefined,
        },
        signal,
      ),
    [offset, kind, status, chain, systemOnly],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <AdminPageHeader
        title="Relay"
        description="Gasless relayer health and the request queue. Auto-refreshes every 30 seconds."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <RelayerHealth reloadKey={reloadKey} />
      <Card className="admin-toolbar">
        <StatusFilter
          options={STATUSES}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setOffset(0);
          }}
        />
        <Field label="Kind" className="toolbar-field">
          <Select
            value={kind}
            onChange={(e) => {
              setKind(KINDS.find((k) => k === e.target.value) ?? "");
              setOffset(0);
            }}
          >
            <option value="">all kinds</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        </Field>
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
        <label className="admin-check">
          <input
            type="checkbox"
            checked={systemOnly}
            onChange={(e) => {
              setSystemOnly(e.target.checked);
              setOffset(0);
            }}
          />
          Automatic executions only
        </label>
      </Card>
      <AdminListCard
        error={error}
        errorTitle="Could not load relay requests"
        onRetry={() => setReloadKey((k) => k + 1)}
        hasData={page !== null}
        footer={<AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />}
      >
        <DataTable
          columns={COLUMNS}
          rows={items}
          rowKey={(r) => r.id}
          caption="Relay requests"
          loading={loading && page === null}
          dense
          stickyHeader
          emptyTitle="No relay requests."
        />
      </AdminListCard>
    </section>
  );
}
