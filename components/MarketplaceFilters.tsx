"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import {
  CHAIN_OPTIONS,
  SORT_OPTIONS,
  STATE_OPTIONS,
  toQueryString,
  type MarketplaceFilters as Filters,
} from "@/lib/marketplaceFilters";
import type { ProjectState } from "@/lib/api";

const DEBOUNCE_MS = 400;

type StateValue = ProjectState | "ALL";

const STATE_LABELS: Record<ProjectState, string> = {
  FUNDING: "Funding",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  SHUTDOWN: "Shut down",
};

const STATE_SEGMENTS: ReadonlyArray<SegmentOption<StateValue>> = [
  { value: "ALL", label: "All" },
  ...STATE_OPTIONS.map((s) => ({ value: s, label: STATE_LABELS[s] })),
];

function sanitizeCategory(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+/, "").slice(0, 32);
}

export function MarketplaceFilters({ current }: { current: Filters }): React.ReactElement {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const [category, setCategory] = useState(current.category ?? "");

  function apply(patch: Partial<Filters>): void {
    const qs = toQueryString({ ...current, ...patch, page: 1 });
    router.replace(qs ? `/projects?${qs}` : "/projects", { scroll: false });
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

  const descending = (current.order ?? "desc") === "desc";

  return (
    <Card className="toolbar" role="search" aria-label="Filter projects">
      <div className="toolbar-row">
        <div className="toolbar-search">
          <Search size={16} aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search projects"
            value={q}
            maxLength={64}
            placeholder="Search projects"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          className="toolbar-field"
          aria-label="Chain"
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
        </Select>
        <Select
          className="toolbar-field"
          aria-label="Sort by"
          value={current.sort ?? "created_at"}
          onChange={(e) => apply({ sort: SORT_OPTIONS.find((s) => s.value === e.target.value)?.value })}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          onClick={() => apply({ order: descending ? "asc" : "desc" })}
          rightIcon={descending ? <ArrowDown size={16} aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
        >
          {descending ? "Descending" : "Ascending"}
        </Button>
      </div>
      <div className="toolbar-row">
        <div className="toolbar-scroll">
          <SegmentedControl
            label="Status"
            options={STATE_SEGMENTS}
            value={current.state ?? "ALL"}
            onChange={(v) => apply({ state: v === "ALL" ? undefined : v })}
          />
        </div>
        <Input
          className="toolbar-field"
          aria-label="Category"
          value={category}
          maxLength={32}
          placeholder="Category, e.g. defi"
          onChange={(e) => setCategory(sanitizeCategory(e.target.value))}
          style={{ maxWidth: 260 }}
        />
      </div>
    </Card>
  );
}
