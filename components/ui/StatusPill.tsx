import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "badge-active",
  warning: "badge-pending",
  danger: "badge-danger",
  info: "badge-info",
  neutral: "badge-inactive",
  accent: "badge-brand",
};

interface StatusPillProps {
  tone: StatusTone;
  /** Visible text; status is never conveyed by colour or the dot alone. */
  children: ReactNode;
  className?: string;
  title?: string;
}

export function StatusPill({ tone, children, className, title }: StatusPillProps): React.ReactElement {
  return (
    <span className={cx("badge", TONE_CLASS[tone], className)} title={title}>
      {children}
    </span>
  );
}
