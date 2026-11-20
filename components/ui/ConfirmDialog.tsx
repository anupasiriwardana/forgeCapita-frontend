"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { describeApiError } from "@/lib/api";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  confirmDisabled?: boolean;
  /** May be async. The dialog shows a spinner while it runs, closes on success and shows the error on failure. */
  onConfirm: () => void | Promise<void>;
  /** Fallback text when the thrown error has no safe message. */
  errorFallback?: string;
  /** Custom safe message mapping (for example wallet rejections); defaults to describeApiError. */
  describeError?: (err: unknown) => string;
  /** Optional block content below the description, for example a note field. */
  children?: ReactNode;
}

/** Controlled confirmation dialog for consequential actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  confirmDisabled = false,
  onConfirm,
  errorFallback = "The action failed. Please try again.",
  describeError,
  children,
}: ConfirmDialogProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean): void {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function handleConfirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onOpenChange(false);
    } catch (err) {
      setBusy(false);
      setError(describeError ? describeError(err) : describeApiError(err, errorFallback));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={title}
        description={body}
        hideClose={busy}
        preventDismiss={busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} disabled={confirmDisabled} onClick={() => void handleConfirm()}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {(children || error) && (
          <div className="stack-md">
            {children}
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
