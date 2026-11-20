import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, { className: string; Icon: LucideIcon; label: string }> = {
  info: { className: "alert-info", Icon: Info, label: "Information" },
  success: { className: "alert-success", Icon: CheckCircle2, label: "Success" },
  warning: { className: "alert-warning", Icon: AlertTriangle, label: "Warning" },
  danger: { className: "alert-error", Icon: XCircle, label: "Error" },
};

interface InlineAlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Persistent, in-context message. Danger alerts are announced (role=alert); others are polite (role=status). */
export function InlineAlert({ tone = "info", title, children, action, className }: InlineAlertProps): React.ReactElement {
  const { className: toneClass, Icon, label } = TONES[tone];
  return (
    <div className={cx("alert", toneClass, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <span className="sr-only">{label}: </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: children ? 2 : 0 }}>{title}</div>}
        {children && <div style={{ color: "var(--text-2)" }}>{children}</div>}
      </div>
      {action && <div style={{ flexShrink: 0, alignSelf: "center" }}>{action}</div>}
    </div>
  );
}
