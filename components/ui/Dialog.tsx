"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** Root and trigger re-exported from Radix (controlled via open / onOpenChange, or uncontrolled with a trigger). */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

interface DialogContentProps {
  /** Required for accessibility: becomes the dialog's accessible name. */
  title: ReactNode;
  /** Required for accessibility: becomes the dialog's accessible description. */
  description: ReactNode;
  children?: ReactNode;
  /** Action row rendered at the bottom (buttons). */
  footer?: ReactNode;
  maxWidth?: number;
  /** Hide the X close button (for example while a confirm action is running). */
  hideClose?: boolean;
  /** Block Escape and outside clicks (for example while busy). */
  preventDismiss?: boolean;
  className?: string;
}

/** Modal panel: focus trap, Escape to close, blurred backdrop, bottom sheet under 640px. */
export function DialogContent({
  title,
  description,
  children,
  footer,
  maxWidth = 480,
  hideClose = false,
  preventDismiss = false,
  className,
}: DialogContentProps): React.ReactElement {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="ui-dialog-overlay" />
      <RadixDialog.Content
        className={cx("ui-dialog-content", className)}
        style={{ maxWidth }}
        onEscapeKeyDown={(e) => {
          if (preventDismiss) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (preventDismiss) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (preventDismiss) e.preventDefault();
        }}
      >
        <RadixDialog.Title style={{ fontSize: 18, fontWeight: 600, paddingRight: 36 }}>{title}</RadixDialog.Title>
        <RadixDialog.Description style={{ fontSize: 14, color: "var(--text-2)", marginTop: 6, lineHeight: 1.55 }}>
          {description}
        </RadixDialog.Description>
        {children && <div style={{ marginTop: 16 }}>{children}</div>}
        {footer && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 24 }}>{footer}</div>
        )}
        {!hideClose && (
          <RadixDialog.Close className="ui-dialog-close" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
