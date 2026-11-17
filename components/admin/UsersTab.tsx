"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  describeApiError,
  listAdminUsers,
  setUserRole,
  shortAddr,
  type AdminUserDto,
  type ManagedRole,
  type UserRole,
} from "@/lib/api";
import { ADMIN_PAGE_SIZE as PAGE_SIZE, AdminPager as Pager } from "./shared";

const PREFIX_REGEX = /^0x[0-9a-f]{0,40}$/;
const ROLE_FILTERS: (UserRole | "all")[] = ["all", "founder", "staff", "investor", "admin"];
const MANAGED_ROLES: ManagedRole[] = ["founder", "staff", "investor"];

export function UsersTab() {
  const [offset, setOffset] = useState(0);
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminUserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const q = search.trim().toLowerCase();
  const qValid = q === "" || PREFIX_REGEX.test(q);

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
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load users"));
      });
    return () => controller.abort();
  }, [roleFilter, q, qValid, offset, reloadKey]);

  const [pending, setPending] = useState<{ user: AdminUserDto; role: ManagedRole } | null>(null);

  const requestRoleChange = (user: AdminUserDto, role: ManagedRole) => {
    if (busy || role === user.role) return;
    setPending({ user, role });
  };

  const changeRole = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await setUserRole(pending.user.address, pending.role);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(describeApiError(err, "Role change failed"));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <section>
      <h1 style={{ fontSize: "22px", marginBottom: "16px" }}>Users</h1>
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select
          className="input-field"
          style={{ width: "160px" }}
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as UserRole | "all");
            setOffset(0);
          }}
          aria-label="Filter by role"
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          className="input-field"
          style={{ width: "360px", maxWidth: "100%" }}
          placeholder="Address prefix (0x…)"
          value={search}
          maxLength={42}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          aria-label="Address prefix"
        />
      </div>
      {!qValid && <div role="alert" className="alert alert-warning" style={{ marginBottom: "12px" }}>Prefix must be 0x followed by hex digits</div>}
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      <div className="glass-card" style={{ padding: "8px" }}>
        {items.length === 0 && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>No users.</p>}
        {items.map((u) => (
          <div
            key={u.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1.5fr 1fr",
              gap: "8px",
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: "14px",
            }}
          >
            <span title={u.address}>{shortAddr(u.address)}</span>
            <span>{u.role}</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}
            </span>
            {u.role === "admin" ? (
              <span />
            ) : (
              <select
                className="input-field"
                value={u.role}
                disabled={busy}
                aria-label={`Role for ${u.address}`}
                onChange={(e) => requestRoleChange(u, e.target.value as ManagedRole)}
              >
                {MANAGED_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />
      <ConfirmDialog
        open={pending !== null}
        title="Change user role?"
        confirmLabel="Change role"
        busy={busy}
        onConfirm={() => void changeRole()}
        onCancel={() => setPending(null)}
      >
        Change {pending?.user.address} from {pending?.user.role} to {pending?.role}?
      </ConfirmDialog>
    </section>
  );
}
