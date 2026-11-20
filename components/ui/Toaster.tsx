"use client";

import { Toaster as SonnerToaster } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

const ICON_STYLE = { flexShrink: 0 } as const;

/** App-wide toast outlet, themed with the design tokens. Mounted once in Providers. */
export function Toaster(): React.ReactElement {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      richColors={false}
      closeButton
      gap={8}
      icons={{
        success: <CheckCircle2 size={16} aria-hidden="true" style={{ ...ICON_STYLE, color: "var(--success)" }} />,
        error: <XCircle size={16} aria-hidden="true" style={{ ...ICON_STYLE, color: "var(--danger)" }} />,
        warning: <AlertTriangle size={16} aria-hidden="true" style={{ ...ICON_STYLE, color: "var(--warning)" }} />,
        info: <Info size={16} aria-hidden="true" style={{ ...ICON_STYLE, color: "var(--info)" }} />,
        loading: <Loader2 size={16} aria-hidden="true" className="animate-spin" style={{ ...ICON_STYLE, color: "var(--text-2)" }} />,
      }}
      toastOptions={{
        style: {
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          color: "var(--text)",
          borderRadius: "var(--r-md)",
          fontFamily: "inherit",
          fontSize: "14px",
          boxShadow: "var(--shadow-lg)",
        },
        descriptionClassName: "toast-description",
      }}
    />
  );
}
