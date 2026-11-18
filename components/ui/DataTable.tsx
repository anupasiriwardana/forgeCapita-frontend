"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right" | "center";
  width?: CSSProperties["width"];
  /** Use tabular figures (amounts, counts, dates). */
  numeric?: boolean;
}

interface DataTableProps<Row> {
  columns: ReadonlyArray<DataTableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  /** Accessible caption (visually hidden). */
  caption: string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  onRowClick?: (row: Row) => void;
  dense?: boolean;
  stickyHeader?: boolean;
  /** Max height of the scroll area; needed for a sticky header to stick. */
  maxHeight?: CSSProperties["maxHeight"];
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  skeletonRows = 5,
  emptyTitle = "Nothing here yet",
  emptyText,
  emptyAction,
  onRowClick,
  dense = false,
  stickyHeader = false,
  maxHeight,
  className,
}: DataTableProps<Row>): React.ReactElement {
  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyTitle} text={emptyText} action={emptyAction} className={className} />;
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, row: Row): void {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className={cx("ui-table-wrap", className)} style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined }}>
      <table
        className={cx("ui-table", dense && "ui-table-dense", stickyHeader && "ui-table-sticky", onRowClick && "ui-table-clickable")}
        aria-busy={loading || undefined}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: c.align ?? "left", width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`skeleton-${i}`}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <Skeleton width={c.numeric ? "50%" : "70%"} height={12} style={{ marginLeft: c.align === "right" ? "auto" : undefined }} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onRowKeyDown(e, row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? "num" : undefined} style={{ textAlign: c.align ?? "left" }}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {loading && <span className="sr-only" role="status">Loading</span>}
    </div>
  );
}
