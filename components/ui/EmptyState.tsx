import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, text, action, className }: EmptyStateProps): React.ReactElement {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, padding: "40px 20px" }}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: "var(--r-md)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
          marginBottom: 4,
        }}
      >
        {icon ?? <Inbox size={20} />}
      </span>
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {text && <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 380 }}>{text}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
