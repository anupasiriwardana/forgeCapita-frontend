"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import type { StatusTone } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import { ApiError, describeFounderError, type Page } from "@/lib/api";

/** The server's request id of a failed call, shown as "Ref: ..." so staff can quote it. */
export function errorRequestId(err: unknown): string | undefined {
  return err instanceof ApiError ? err.requestId : undefined;
}
import { exactTime, formatAge } from "@/lib/timeAgo";

export const ADMIN_PAGE_SIZE = 20;
export const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/;
export const PROJECT_ID_REGEX = /^[0-9]+:0x[0-9a-f]{40}$/;

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface Result<T> {
  load: (signal: AbortSignal) => Promise<Page<T>>;
  reloadKey: number;
  page: Page<T> | null;
  error: string;
  requestId?: string;
}

/** Loads a page when `load` (memoised by the caller) or `reloadKey` changes; `load === null` skips the fetch. */
export function useAdminList<T>(
  load: ((signal: AbortSignal) => Promise<Page<T>>) | null,
  reloadKey: number,
): { page: Page<T> | null; error: string; requestId?: string; loading: boolean } {
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    const { signal } = controller;
    load(signal)
      .then((page) => {
        if (!signal.aborted) setResult({ load, reloadKey, page, error: "" });
      })
      .catch((err: unknown) => {
        if (!signal.aborted) {
          setResult((prev) => ({
            load,
            reloadKey,
            page: prev?.page ?? null,
            error: describeFounderError(err, "Failed to load"),
            requestId: errorRequestId(err),
          }));
        }
      });
    return () => controller.abort();
  }, [load, reloadKey]);

  const loading = load !== null && (result === null || result.load !== load || result.reloadKey !== reloadKey);
  return {
    page: result?.page ?? null,
    error: loading ? "" : (result?.error ?? ""),
    requestId: loading ? undefined : result?.requestId,
    loading,
  };
}

/** Prev / Next pager with an "x-y of total" summary; same paging maths as before the redesign. */
export function AdminPager({ offset, total, onChange }: { offset: number; total: number; onChange: (o: number) => void }) {
  return (
    <nav className="admin-pager" aria-label="Pagination">
      <span className="num" aria-live="polite">
        {total === 0 ? 0 : offset + 1}-{Math.min(offset + ADMIN_PAGE_SIZE, total)} of {total}
      </span>
      <div className="inline-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - ADMIN_PAGE_SIZE))}
          leftIcon={<ChevronLeft size={14} aria-hidden="true" />}
        >
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={offset + ADMIN_PAGE_SIZE >= total}
          onClick={() => onChange(offset + ADMIN_PAGE_SIZE)}
          rightIcon={<ChevronRight size={14} aria-hidden="true" />}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/** Page title row: one h1, a short description and optional actions. */
export function AdminPageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-title-row">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-title-actions">{actions}</div>}
    </div>
  );
}

/**
 * Card around a list table. With no data yet a load error becomes an ErrorState with retry; once data
 * exists the error is shown above the (stale) table instead.
 */
export function AdminListCard({
  error,
  requestId,
  errorTitle,
  onRetry,
  hasData,
  footer,
  children,
}: {
  error: string;
  requestId?: string;
  errorTitle: string;
  onRetry: () => void;
  hasData: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {error && hasData && (
        <InlineAlert tone="danger" className="panel-gap">
          {error}
          {requestId && (
            <>
              {" "}
              <span className="mono">Ref: {requestId}</span>
            </>
          )}
        </InlineAlert>
      )}
      <Card className="admin-table-card">
        {error && !hasData ? (
          <ErrorState title={errorTitle} message={error} requestId={requestId} onRetry={onRetry} />
        ) : (
          children
        )}
        {hasData && footer}
      </Card>
    </>
  );
}

/** "OPEN" / "vote_open" -> "Open" / "Vote open". Display only; values sent to the API are unchanged. */
export function statusLabel(value: string): string {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Status filter as a segmented control; "" means all. */
export function StatusFilter<T extends string>({
  options,
  value,
  onChange,
  label = "Status",
}: {
  options: ReadonlyArray<T>;
  value: T | "";
  onChange: (value: T | "") => void;
  label?: string;
}) {
  const segments: SegmentOption<T | "">[] = [{ value: "", label: "All" }, ...options.map((o) => ({ value: o, label: statusLabel(o) }))];
  return (
    <div className="admin-filter">
      <span className="label" aria-hidden="true">
        {label}
      </span>
      <div className="toolbar-scroll">
        <SegmentedControl options={segments} value={value} onChange={onChange} label={`Filter by ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Relative age ("5 minutes ago") with the exact local time in a tooltip. */
export function RelativeTime({ iso, fallback = "-" }: { iso: string | null; fallback?: string }) {
  const now = useNow();
  const exact = exactTime(iso);
  if (!iso || !exact) return <span className="cell-sub">{fallback}</span>;
  return (
    <Tooltip content={exact}>
      <time dateTime={iso} tabIndex={0} className="admin-time num">
        {formatAge(iso, now)}
        <span className="sr-only"> ({exact})</span>
      </time>
    </Tooltip>
  );
}

export function SafeLink({ href }: { href: string }) {
  if (!href.startsWith("https://")) return <span className="text-wrap">{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-accent text-wrap">
      {href}
    </a>
  );
}

/** Label / value pair inside a detail dialog. */
export function Row({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "admin-detail-row is-wide" : "admin-detail-row"}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function badgeClass(status: string): string {
  return status === "approved" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-inactive";
}

const BADGE_TONES: Record<string, StatusTone> = {
  "badge-active": "success",
  "badge-pending": "warning",
  "badge-danger": "danger",
  "badge-info": "info",
  "badge-brand": "accent",
  "badge-inactive": "neutral",
};

/** Maps an existing badge class (badgeClass, complianceBadge, complaintBadge) to a StatusPill tone. */
export function toneFromBadge(badge: string): StatusTone {
  return BADGE_TONES[badge] ?? "neutral";
}
