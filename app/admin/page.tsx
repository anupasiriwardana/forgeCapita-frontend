"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  ApiError,
  describeApiError,
  describeFounderError,
  approveApplication,
  approveShadowWallet,
  getAdminApplication,
  listAdminApplications,
  listAdminShadowWallets,
  listAdminUsers,
  rejectApplication,
  rejectShadowWallet,
  setUserRole,
  shortAddr,
  type AdminUserDto,
  type ApplicationDto,
  type ApplicationStatus,
  type ManagedRole,
  type ShadowWalletStatus,
  type StaffShadowWalletDto,
  type UserRole,
} from "@/lib/api";

const PAGE_SIZE = 20;
const PREFIX_REGEX = /^0x[0-9a-f]{0,40}$/;
const TABS: { key: ApplicationStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];
const ROLE_FILTERS: (UserRole | "all")[] = ["all", "founder", "staff", "investor", "admin"];
const MANAGED_ROLES: ManagedRole[] = ["founder", "staff", "investor"];

function SafeLink({ href }: { href: string }) {
  if (!href.startsWith("https://")) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)", wordBreak: "break-all" }}>
      {href}
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "14px", wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

function Pager({ offset, total, onChange }: { offset: number; total: number; onChange: (o: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "12px", fontSize: "13px" }}>
      <button type="button" className="btn-secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>
        Prev
      </button>
      <span>
        {total === 0 ? 0 : offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
      </span>
      <button type="button" className="btn-secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => onChange(offset + PAGE_SIZE)}>
        Next
      </button>
    </div>
  );
}

function badgeClass(status: string): string {
  return status === "approved" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-inactive";
}

function ApplicationsSection({ selfAddress }: { selfAddress: string }) {
  const [tab, setTab] = useState<ApplicationStatus | "all">("pending");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ApplicationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDto | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [kyc, setKyc] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listAdminApplications(
      { status: tab === "all" ? undefined : tab, limit: PAGE_SIZE, offset },
      signal,
    )
      .then((page) => {
        if (signal.aborted) return;
        setItems(page.items);
        setTotal(page.total);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load applications"));
      });
    return () => controller.abort();
  }, [tab, offset, reloadKey]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const { signal } = controller;
    getAdminApplication(selectedId, signal)
      .then((app) => {
        if (!signal.aborted) setDetail(app);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load application"));
      });
    return () => controller.abort();
  }, [selectedId, reloadKey]);

  const choose = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setKyc(false);
    setNote("");
    setSuccess("");
  };

  const review = useCallback(
    async (action: "approve" | "reject") => {
      if (!detail || busy) return;
      const trimmed = note.trim();
      if (action === "reject" && !trimmed) {
        setError("A note is required to reject");
        return;
      }
      if (trimmed.length > 500) {
        setError("Note must be at most 500 characters");
        return;
      }
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        if (action === "approve") await approveApplication(detail.id, trimmed || undefined);
        else await rejectApplication(detail.id, trimmed);
        setSuccess(action === "approve" ? "Application approved" : "Application rejected");
        setKyc(false);
        setNote("");
        setReloadKey((k) => k + 1);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403 && detail.walletAddress.toLowerCase() === selfAddress.toLowerCase()) {
          setError("You cannot review your own application");
        } else if (err instanceof ApiError && err.status === 409) {
          setError("Already reviewed, refresh the list");
        } else {
          setError(describeApiError(err, "Review failed"));
        }
      } finally {
        setBusy(false);
      }
    },
    [detail, busy, note, selfAddress],
  );

  return (
    <section style={{ marginBottom: "48px" }}>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Applications</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setTab(t.key);
              setOffset(0);
              setSelectedId(null);
              setDetail(null);
              setSuccess("");
            }}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      {success && <div role="status" className="alert alert-success" style={{ marginBottom: "12px" }}>{success}</div>}
      <div className="glass-card" style={{ padding: "8px" }}>
        {items.length === 0 && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>No applications.</p>}
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => choose(a.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
              gap: "8px",
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              background: a.id === selectedId ? "rgba(99,102,241,0.12)" : "transparent",
              border: "none",
              borderBottom: "1px solid var(--border)",
              color: "inherit",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            <span>{a.projectName}</span>
            <span>{shortAddr(a.walletAddress)}</span>
            <span><span className={`badge ${badgeClass(a.status)}`}>{a.status}</span></span>
            <span style={{ color: "var(--text-secondary)" }}>{new Date(a.createdAt).toLocaleString()}</span>
          </button>
        ))}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />

      {selectedId && (
        <div className="glass-card" style={{ padding: "24px", marginTop: "16px" }}>
          {!detail ? (
            <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
          ) : (
            <>
              <h3 style={{ fontSize: "18px", marginBottom: "12px" }}>{detail.projectName}</h3>
              <Row label="Status">{detail.status}</Row>
              <Row label="Wallet">{detail.walletAddress}</Row>
              <Row label="Summary"><span style={{ whiteSpace: "pre-wrap" }}>{detail.summary}</span></Row>
              <Row label="Website"><SafeLink href={detail.websiteUrl} /></Row>
              <Row label="Pitch deck"><SafeLink href={detail.pitchDeckUrl} /></Row>
              {detail.repoUrl && <Row label="Repository"><SafeLink href={detail.repoUrl} /></Row>}
              {detail.contact && <Row label="Contact">{detail.contact}</Row>}
              <Row label="Submitted">{new Date(detail.createdAt).toLocaleString()}</Row>
              {detail.reviewNote && <Row label="Review note">{detail.reviewNote}</Row>}
              {detail.kycVerifiedAt && <Row label="KYC verified at">{new Date(detail.kycVerifiedAt).toLocaleString()}</Row>}
              {detail.status === "pending" && (
                <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                  <label style={{ fontSize: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="checkbox" checked={kyc} onChange={(e) => setKyc(e.target.checked)} />
                    I verified this founder off-platform (KYC)
                  </label>
                  <div>
                    <label className="label" htmlFor="reviewNote">Note (required to reject)</label>
                    <textarea id="reviewNote" className="input-field" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button type="button" className="btn-success" disabled={!kyc || busy} onClick={() => void review("approve")}>
                      Approve
                    </button>
                    <button type="button" className="btn-danger" disabled={busy} onClick={() => void review("reject")}>
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

const WALLET_TABS: { key: ShadowWalletStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ShadowWalletsSection() {
  const [tab, setTab] = useState<ShadowWalletStatus>("pending");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<StaffShadowWalletDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listAdminShadowWallets(tab, PAGE_SIZE, offset, signal)
      .then((page) => {
        if (signal.aborted) return;
        setItems(page.items);
        setTotal(page.total);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load shadow wallets"));
      });
    return () => controller.abort();
  }, [tab, offset, reloadKey]);

  const review = async (id: string, action: "approve" | "reject") => {
    if (busy) return;
    const note = (notes[id] ?? "").trim();
    if (action === "reject" && !note) {
      setError("A note is required to reject");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (action === "approve") await approveShadowWallet(id, note || undefined);
      else await rejectShadowWallet(id, note);
      setSuccess(action === "approve" ? "Shadow wallet approved" : "Shadow wallet rejected");
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError("You cannot review your own wallet");
      else if (err instanceof ApiError && err.status === 404) setError("Shadow wallet not found, refresh the list");
      else setError(describeFounderError(err, "Review failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: "48px" }}>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Shadow wallets</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {WALLET_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setTab(t.key);
              setOffset(0);
              setSuccess("");
            }}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      {success && <div role="status" className="alert alert-success" style={{ marginBottom: "12px" }}>{success}</div>}
      <div className="glass-card" style={{ padding: "8px" }}>
        {items.length === 0 && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>No shadow wallets.</p>}
        {items.map((w) => (
          <div key={w.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: "14px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <span title={w.address}>{shortAddr(w.address)}</span>
              <span style={{ color: "var(--text-secondary)" }} title={w.founderWallet}>
                founder {shortAddr(w.founderWallet)}
              </span>
              <span className={`badge ${badgeClass(w.status)}`}>{w.status}</span>
              <span style={{ color: "var(--text-secondary)" }}>{new Date(w.createdAt).toLocaleString()}</span>
            </div>
            {(w.reviewNote || w.reviewedAt) && (
              <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
                {w.reviewNote}
                {w.reviewedAt && ` (reviewed ${new Date(w.reviewedAt).toLocaleString()})`}
              </div>
            )}
            {w.status === "pending" && (
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <input
                  className="input-field"
                  style={{ flex: 1, minWidth: "200px" }}
                  placeholder="Note (required to reject)"
                  maxLength={500}
                  value={notes[w.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  aria-label={`Note for ${w.address}`}
                />
                <button type="button" className="btn-success" disabled={busy} onClick={() => void review(w.id, "approve")}>
                  Approve
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy || !(notes[w.id] ?? "").trim()}
                  onClick={() => void review(w.id, "reject")}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />
    </section>
  );
}

function UsersSection() {
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

  const changeRole = async (user: AdminUserDto, role: ManagedRole) => {
    if (busy || role === user.role) return;
    if (!window.confirm(`Change ${user.address} from ${user.role} to ${role}?`)) return;
    setBusy(true);
    setError("");
    try {
      await setUserRole(user.address, role);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(describeApiError(err, "Role change failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 style={{ fontSize: "22px", marginBottom: "16px" }}>Users</h2>
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
                onChange={(e) => void changeRole(u, e.target.value as ManagedRole)}
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
    </section>
  );
}

export default function AdminPage() {
  const { user, role, loading, signIn } = useAuth();
  let content: React.ReactNode;
  if (loading && !user) {
    content = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else if (!user) {
    content = (
      <div className="alert alert-warning" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span>Please sign in</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>
          Sign in
        </button>
      </div>
    );
  } else if (role !== "staff" && role !== "admin") {
    content = <div className="alert alert-warning">Staff access only</div>;
  } else {
    content = (
      <>
        <ApplicationsSection selfAddress={user.address} />
        <ShadowWalletsSection />
        {role === "admin" && <UsersSection />}
      </>
    );
  }
  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Admin</h1>
      {content}
    </div>
  );
}
