import { Ban, CheckCircle2, CircleDot, PowerOff, TrendingUp, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; className: string; Icon: LucideIcon }> = {
  FUNDING: { label: "Funding", className: "badge-active", Icon: TrendingUp },
  ACTIVE: { label: "Active", className: "badge-active", Icon: CircleDot },
  COMPLETED: { label: "Completed", className: "badge-brand", Icon: CheckCircle2 },
  FAILED: { label: "Failed", className: "badge-inactive", Icon: XCircle },
  CANCELLED: { label: "Cancelled", className: "badge-inactive", Icon: Ban },
  SHUTDOWN: { label: "Shut down", className: "badge-inactive", Icon: PowerOff },
};

export function ProjectStatusBadge({ status }: { status: string }): React.ReactElement {
  const entry = Object.hasOwn(STATUS_BADGE, status) ? STATUS_BADGE[status] : undefined;
  if (!entry) {
    return <span className="badge badge-inactive">{status}</span>;
  }
  const { label, className, Icon } = entry;
  return (
    <span className={`badge ${className}`}>
      <Icon size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
      {label}
    </span>
  );
}
