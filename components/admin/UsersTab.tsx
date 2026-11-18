"use client";

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Field";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import {
  describeApiError,
  listAdminUsers,
  setUserRole,
  type AdminUserDto,
  type ManagedRole,
  type UserRole,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { ADMIN_PAGE_SIZE as PAGE_SIZE, AdminListCard, AdminPageHeader, errorRequestId, AdminPager as Pager, RelativeTime, statusLabel } from "./shared";

const PREFIX_REGEX = /^0x[0-9a-f]{0,40}$/;
const ROLE_FILTERS: (UserRole | "all")[] = ["all", "founder", "staff", "investor", "admin"];
const MANAGED_ROLES: ManagedRole[] = ["founder", "staff", "investor"];

const ROLE_TONES: Partial<Record<string, StatusTone>> = {
  admin: "danger",
  staff: "info",
  founder: "accent",
  investor: "neutral",
};

export function UsersTab() {
  const [offset, setOffset] = useState(0);
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminUserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [errorRef, setErrorRef] = useState<string | undefined>(undefined);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const q = search.trim().toLowerCase();
  const qValid = q === "" || PREFIX_REGEX.test(q);
  const listKey = `${roleFilter}:${q}:${offset}:${reloadKey}`;

  useEffect(() => {
    if (!qValid) return;
    const controller = new AbortController();
    const { signal } = controller;
    listAdminUsers(
      { role: roleFilter === "all" ? undefined : roleFilter, q: q || undefined, limit: PAGE_SIZE, offset },
      signal,
    )
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
        setError(describeApiError(err, "Failed to load users"));
        setErrorRef(errorRequestId(err));
        setLoadedKey(listKey);
      });
    return () => controller.abort();
  }, [roleFilter, q, qValid, offset, reloadKey, listKey]);

  const [pending, setPending] = useState<{ user: AdminUserDto; role: ManagedRole } | null>(null);

  const requestRoleChange = (user: AdminUserDto, role: ManagedRole) => {
    if (role === user.role) return;
    setPending({ user, role });
  };

  const changeRole = async (): Promise<void> => {
    if (!pending) return;
    await setUserRole(pending.user.address, pending.role);
    toast.success("Role changed", { description: `${statusLabel(pending.user.role)} to ${statusLabel(pending.role)}` });
    setReloadKey((k) => k + 1);
  };

  const refresh = () => setReloadKey((k) => k + 1);

  const columns: ReadonlyArray<DataTableColumn<AdminUserDto>> = [
    { key: "address", header: "Wallet", cell: (u) => <AddressChip address={u.address} /> },
    { key: "role", header: "Role", cell: (u) => <StatusPill tone={ROLE_TONES[u.role] ?? "neutral"}>{statusLabel(u.role)}</StatusPill> },
    { key: "login", header: "Last sign-in", numeric: true, cell: (u) => <RelativeTime iso={u.lastLoginAt} fallback="never" /> },
    {
      key: "change",
      header: "Change role",
      align: "right",
      cell: (u) =>
        u.role === "admin" ? (
          <span className="cell-sub">Not editable</span>
        ) : (
          <Select
            value={u.role}
            aria-label={`Role for ${u.address}`}
            onChange={(e) => requestRoleChange(u, e.target.value as ManagedRole)}
            style={{ width: 140, marginLeft: "auto" }}
          >
            {MANAGED_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        ),
    },
  ];

  return (
    <section>
      <AdminPageHeader
        title="Users"
        description="Every signed-in wallet and its role. Role changes are recorded in the audit log."
        actions={
          <Button variant="secondary" size="sm" onClick={refresh} leftIcon={<RotateCw size={14} aria-hidden="true" />}>
            Refresh
          </Button>
        }
      />
      <Card className="admin-toolbar">
        <Field label="Role" className="toolbar-field">
          <Select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as UserRole | "all");
              setOffset(0);
            }}
          >
            {ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Address prefix"
          className="toolbar-field toolbar-field-wide"
          error={!qValid ? "Prefix must be 0x followed by hex digits" : undefined}
        >
          <Input
            placeholder="0x…"
            value={search}
            maxLength={42}
            spellCheck={false}
            autoComplete="off"
            className="mono"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
      </Card>
      <AdminListCard
        error={error}
        requestId={errorRef}
        errorTitle="Could not load users"
        onRetry={refresh}
        hasData={hasData}
        footer={<Pager offset={offset} total={total} onChange={setOffset} />}
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(u) => u.id}
          caption="Users"
          loading={qValid && loadedKey !== listKey}
          dense
          stickyHeader
          emptyTitle="No users."
        />
      </AdminListCard>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Change user role?"
        body={
          pending ? (
            <>
              Change <span className="mono">{pending.user.address}</span> from {pending.user.role} to {pending.role}?
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Change role"
        onConfirm={changeRole}
        errorFallback="Role change failed"
      />
    </section>
  );
}
