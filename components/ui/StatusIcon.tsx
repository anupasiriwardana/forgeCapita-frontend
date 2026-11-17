import { AlertTriangle, CheckCircle2, Circle, Clock, Info, XCircle } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";

export type StatusIconState = "done" | "todo" | "pending" | "warning" | "error" | "info";

interface StatusIconProps {
  state: StatusIconState;
  label?: string;
  size?: number;
}

const ICONS: Record<
  StatusIconState,
  { Icon: ComponentType<{ size?: number; style?: CSSProperties; "aria-hidden"?: "true" }>; color: string }
> = {
  done: { Icon: CheckCircle2, color: "var(--emerald)" },
  todo: { Icon: Circle, color: "var(--text-muted)" },
  pending: { Icon: Clock, color: "var(--amber)" },
  warning: { Icon: AlertTriangle, color: "var(--amber)" },
  error: { Icon: XCircle, color: "var(--rose)" },
  info: { Icon: Info, color: "var(--brand-accent)" },
};

export function StatusIcon({ state, label, size = 16 }: StatusIconProps): React.ReactElement {
  const { Icon, color } = ICONS[state];
  return (
    <>
      <Icon size={size} aria-hidden="true" style={{ color, flexShrink: 0 }} />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
