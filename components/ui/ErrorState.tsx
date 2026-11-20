"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";

interface ErrorStateProps {
  title?: string;
  message: string;
  /** Server request id; shown small and copyable so users can quote it to support. */
  requestId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  requestId,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps): React.ReactElement {
  return (
    <div
      role="alert"
      className={className}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, padding: "40px 20px" }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: "var(--r-md)",
          background: "var(--danger-soft)",
          color: "var(--danger)",
          marginBottom: 4,
        }}
      >
        <AlertTriangle size={20} />
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
      <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 420 }}>{message}</p>
      {requestId && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-3)" }}>
          <span>
            Ref: <span className="mono">{requestId}</span>
          </span>
          <CopyButton value={requestId} label="Copy reference" successMessage="Reference copied" size={12} />
        </div>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RotateCw size={14} aria-hidden="true" />} style={{ marginTop: 8 }}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
