"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHAIN_OPTIONS,
  SORT_OPTIONS,
  STATE_OPTIONS,
  toQueryString,
  type MarketplaceFilters as Filters,
} from "@/lib/marketplaceFilters";

const DEBOUNCE_MS = 400;

function sanitizeCategory(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+/, "").slice(0, 32);
}

export function MarketplaceFilters({ current }: { current: Filters }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(current.q ?? "");
  const [category, setCategory] = useState(current.category ?? "");

  function apply(patch: Partial<Filters>): void {
    const qs = toQueryString({ ...current, ...patch, page: 1 });
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === (current.q ?? "")) return;
    const t = setTimeout(() => apply({ q: trimmed || undefined }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (category === (current.category ?? "")) return;
    const t = setTimeout(() => apply({ category: category || undefined }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const labelStyle = { fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 } as const;
  const fieldStyle = { display: "flex", flexDirection: "column", gap: "6px", minWidth: "150px", flex: "1 1 150px" } as const;

  return (
    <div style={{ marginBottom: "32px" }}>
      <button
        type="button"
        className="btn-secondary"
        aria-expanded={open}
        aria-controls="marketplace-filters-panel"
        onClick={() => setOpen((o) => !o)}
        style={{ padding: "8px 16px", fontSize: "14px", marginBottom: open ? "12px" : "0" }}
      >
        Filters {open ? "▲" : "▼"}
      </button>

      <div
        id="marketplace-filters-panel"
        style={{ display: open ? "flex" : "none", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}
      >
        <label style={{ ...fieldStyle, flex: "2 1 220px" }}>
          <span style={labelStyle}>Search</span>
          <input
            className="input-field"
            type="search"
            value={q}
            maxLength={64}
            placeholder="Search projects"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Chain</span>
          <select
            className="input-field"
            value={current.chainId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              apply({ chainId: v === "421614" || v === "97" ? v : undefined });
            }}
          >
            <option value="">All chains</option>
            {CHAIN_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Status</span>
          <select
            className="input-field"
            value={current.state ?? ""}
            onChange={(e) => apply({ state: STATE_OPTIONS.find((s) => s === e.target.value) })}
          >
            <option value="">All statuses</option>
            {STATE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Category</span>
          <input
            className="input-field"
            value={category}
            maxLength={32}
            placeholder="e.g. defi"
            onChange={(e) => setCategory(sanitizeCategory(e.target.value))}
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Sort by</span>
          <select
            className="input-field"
            value={current.sort ?? "created_at"}
            onChange={(e) => apply({ sort: SORT_OPTIONS.find((s) => s.value === e.target.value)?.value })}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn-secondary"
          style={{ padding: "10px 16px", fontSize: "14px" }}
          onClick={() => apply({ order: (current.order ?? "desc") === "desc" ? "asc" : "desc" })}
        >
          {(current.order ?? "desc") === "desc" ? "Descending ↓" : "Ascending ↑"}
        </button>
      </div>
    </div>
  );
}
