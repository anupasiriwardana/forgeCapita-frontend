"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { RotateCw } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { chainName } from "@/config/chains";
import { listAdminLaunchDrafts, shortAddr, type AdminLaunchDraftDto, type LaunchDraftStatus } from "@/lib/api";
import {
  ADMIN_PAGE_SIZE,
  AdminListCard,
  AdminPageHeader,
  AdminPager,
  RelativeTime,
  StatusFilter,
  statusLabel,
  toneFromBadge,
  useAdminList,
} from "./shared";

const STATUSES: LaunchDraftStatus[] = ["pending", "attached", "applied", "cancelled", "expired", "conflict"];
const CHAINS = [421614, 97];

function draftBadge(status: LaunchDraftStatus): string {
  if (status === "applied") return "badge-active";
  if (status === "pending" || status === "attached") return "badge-pending";
  return "badge-inactive";
}

const COLUMNS: ReadonlyArray<DataTableColumn<AdminLaunchDraftDto>> = [
  { key: "created", header: "Created", numeric: true, cell: (d) => <RelativeTime iso={d.createdAt} /> },
  { key: "name", header: "Project", cell: (d) => <span className="cell-title text-wrap">{d.name}</span> },
  { key: "wallet", header: "Founder", cell: (d) => <AddressChip address={d.walletAddress} /> },
  { key: "chain", header: "Network", cell: (d) => <span className="cell-sub" style={{ fontSize: 13 }}>{chainName(d.chainId)}</span> },
  { key: "status", header: "Status", cell: (d) => <StatusPill tone={toneFromBadge(draftBadge(d.status))}>{statusLabel(d.status)}</StatusPill> },
  {
    key: "project",
    header: "Escrow",
    cell: (d) =>
      d.projectId ? (
        <Link href={`/projects/${encodeURIComponent(d.projectId)}`} className="link-accent mono" style={{ fontSize: 12 }} title={d.projectId}>
          {d.escrowAddress ? shortAddr(d.escrowAddress) : "project"}
        </Link>
      ) : (
        <span className="cell-sub">-</span>
      ),
  },
  { key: "applied", header: "Applied", numeric: true, cell: (d) => <RelativeTime iso={d.appliedAt} /> },
];

export function LaunchDraftsTab() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<LaunchDraftStatus | "">("");
  const [chain, setChain] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminLaunchDrafts(
        {
          limit: ADMIN_PAGE_SIZE,
          offset,
          status: status || undefined,
          chainId: chain ? Number(chain) : undefined,
        },
        signal,
      ),
    [offset, status, chain],
  );
  const { page, error, loading } = useAdminList(load, reloadKey);
  const items = page?.items ?? [];

  return (
    <section>
      <AdminPageHeader
        title="Launch drafts"
        description="Pending drafts hold the founder's shadow wallet until cancelled or confirmed."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
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
      <AdminListCard
        error={error}
        errorTitle="Could not load launch drafts"
        onRetry={() => setReloadKey((k) => k + 1)}
        hasData={page !== null}
        footer={<AdminPager offset={offset} total={page?.total ?? 0} onChange={setOffset} />}
      >
        <DataTable
          columns={COLUMNS}
          rows={items}
          rowKey={(d) => d.id}
          caption="Launch drafts"
          loading={loading}
          dense
          stickyHeader
          emptyTitle="No launch drafts."
        />
      </AdminListCard>
    </section>
  );
}
