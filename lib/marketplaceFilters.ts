import type { ListProjectsParams, ProjectState } from "@/lib/api";

export const PAGE_SIZE = 12;
const MAX_OFFSET = 10000;

export const CHAIN_OPTIONS: ReadonlyArray<{ value: "421614" | "97"; label: string }> = [
  { value: "421614", label: "Arbitrum Sepolia" },
  { value: "97", label: "BSC Testnet" },
];

export const STATE_OPTIONS: ReadonlyArray<ProjectState> = [
  "FUNDING",
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "SHUTDOWN",
];

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "created_at", label: "Newest" },
  { value: "total_raised", label: "Most raised" },
  { value: "funding_goal", label: "Largest goal" },
];

export type SortKey = "created_at" | "total_raised" | "funding_goal";

export interface MarketplaceFilters {
  chainId?: "421614" | "97";
  state?: ProjectState;
  q?: string;
  category?: string;
  sort?: SortKey;
  order?: "asc" | "desc";
  page: number;
}

const CATEGORY_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseFilters(raw: Record<string, string | string[] | undefined>): MarketplaceFilters {
  const out: MarketplaceFilters = { page: 1 };
  const chain = first(raw.chain);
  if (chain === "421614" || chain === "97") out.chainId = chain;
  const state = first(raw.state);
  const matched = STATE_OPTIONS.find((s) => s === state);
  if (matched) out.state = matched;
  const q = first(raw.q)?.trim();
  if (q && q.length <= 64) out.q = q;
  const category = first(raw.category);
  if (category && CATEGORY_RE.test(category)) out.category = category;
  const sort = SORT_OPTIONS.find((s) => s.value === first(raw.sort));
  if (sort) out.sort = sort.value;
  const order = first(raw.order);
  if (order === "asc" || order === "desc") out.order = order;
  const page = Number(first(raw.page));
  if (Number.isInteger(page) && page >= 1 && (page - 1) * PAGE_SIZE <= MAX_OFFSET) out.page = page;
  return out;
}

export function toQueryString(f: MarketplaceFilters): string {
  const p = new URLSearchParams();
  if (f.chainId) p.set("chain", f.chainId);
  if (f.state) p.set("state", f.state);
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.sort) p.set("sort", f.sort);
  if (f.order) p.set("order", f.order);
  if (f.page > 1) p.set("page", String(f.page));
  return p.toString();
}

export function toListParams(f: MarketplaceFilters): ListProjectsParams {
  const params: ListProjectsParams = {
    limit: PAGE_SIZE,
    offset: Math.min((f.page - 1) * PAGE_SIZE, MAX_OFFSET),
  };
  if (f.chainId) params.chainId = f.chainId === "97" ? 97 : 421614;
  if (f.state) params.state = f.state;
  if (f.q) params.q = f.q;
  if (f.category) params.category = f.category;
  if (f.sort) params.sort = f.sort;
  if (f.order) params.order = f.order;
  return params;
}

export function hasActiveFilters(f: MarketplaceFilters): boolean {
  return Boolean(f.chainId || f.state || f.q || f.category);
}

export function canGoNext(f: MarketplaceFilters, total: number): boolean {
  const nextOffset = f.page * PAGE_SIZE;
  return nextOffset < total && nextOffset <= MAX_OFFSET;
}
