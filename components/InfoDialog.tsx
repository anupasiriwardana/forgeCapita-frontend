"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface InfoDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Extra controls shown next to the close button. */
  actions?: ReactNode;
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function subscribe(): () => void {
  return () => undefined;
}

/** Modal with a single close action (information or notice). */
export function InfoDialog({ open, title, children, onClose, closeLabel = "Close", actions }: InfoDialogProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [open]);

  if (!mounted || !open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "rgba(5, 7, 15, 0.75)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="glass-card"
        style={{ width: "100%", maxWidth: "460px", padding: "28px", background: "var(--bg-card)" }}
      >
        <h2 id={titleId} style={{ fontSize: "20px", marginBottom: "12px" }}>{title}</h2>
        <div id={descId} style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "24px" }}>
          {children}
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
          {actions}
          <button ref={closeRef} type="button" className="btn-primary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const SHADOW_WALLET_TEXT =
  "A shadow wallet is the revenue wallet of one project. It is bound to this project, and all income received by this wallet is monitored against the revenue the project reports to ForgeCapita. Handle the project's revenue through this wallet and no other wallet, and never use it for personal purposes.";

/** Text button that opens a dialog explaining the shadow wallet. */
export function ShadowWalletInfo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", padding: 0, marginLeft: "8px", cursor: "pointer", color: "var(--brand-accent)", fontSize: "13px", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
        What is this?
      </button>
      <InfoDialog open={open} title="What is a shadow wallet?" onClose={() => setOpen(false)}>
        <p>{SHADOW_WALLET_TEXT}</p>
      </InfoDialog>
    </>
  );
}
