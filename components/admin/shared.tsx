"use client";

import { useEffect, useState } from "react";
import { describeFounderError, type Page } from "@/lib/api";
import { EXPLORER_URLS } from "@/config/chains";

export const ADMIN_PAGE_SIZE = 20;
export const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/;
export const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
export const PROJECT_ID_REGEX = /^[0-9]+:0x[0-9a-f]{40}$/;

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  if (!TX_HASH_REGEX.test(hash)) return null;
  const base = (EXPLORER_URLS as Record<number, string | undefined>)[chainId];
  if (!base || !base.startsWith("https://")) return null;
  return `${base}/tx/${hash}`;
}

interface Result<T> {
  load: (signal: AbortSignal) => Promise<Page<T>>;
  reloadKey: number;
  page: Page<T> | null;
  error: string;
}

/** Loads a page when `load` (memoised by the caller) or `reloadKey` changes; `load === null` skips the fetch. */
export function useAdminList<T>(
  load: ((signal: AbortSignal) => Promise<Page<T>>) | null,
  reloadKey: number,
): { page: Page<T> | null; error: string; loading: boolean } {
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
          }));
        }
      });
    return () => controller.abort();
  }, [load, reloadKey]);

  const loading = load !== null && (result === null || result.load !== load || result.reloadKey !== reloadKey);
  return { page: result?.page ?? null, error: loading ? "" : (result?.error ?? ""), loading };
}

export function AdminPager({ offset, total, onChange }: { offset: number; total: number; onChange: (o: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "12px", fontSize: "13px" }}>
      <button type="button" className="btn-secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - ADMIN_PAGE_SIZE))}>
        Prev
      </button>
      <span>
        {total === 0 ? 0 : offset + 1}-{Math.min(offset + ADMIN_PAGE_SIZE, total)} of {total}
      </span>
      <button type="button" className="btn-secondary" disabled={offset + ADMIN_PAGE_SIZE >= total} onClick={() => onChange(offset + ADMIN_PAGE_SIZE)}>
        Next
      </button>
    </div>
  );
}

export function ListState({ loading, error, empty, emptyText }: { loading: boolean; error: string; empty: boolean; emptyText: string }) {
  return (
    <>
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      {loading && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>Loading…</p>}
      {!loading && !error && empty && <p style={{ padding: "12px", color: "var(--text-secondary)" }}>{emptyText}</p>}
    </>
  );
}

export const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gap: "8px",
  alignItems: "center",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  fontSize: "13px",
};
