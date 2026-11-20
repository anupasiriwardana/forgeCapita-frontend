import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...rest }: DivProps): React.ReactElement {
  return <div className={cx("ui-card", className)} {...rest} />;
}

interface CardHeaderProps extends Omit<DivProps, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Heading level for the title; defaults to h2. */
  as?: "h2" | "h3" | "h4";
}

export function CardHeader({ title, subtitle, actions, as: Heading = "h2", className, style, ...rest }: CardHeaderProps): React.ReactElement {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 20px 0", flexWrap: "wrap", ...style }}
      {...rest}
    >
      <div style={{ minWidth: 0 }}>
        <Heading style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</Heading>
        {subtitle && <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}</div>}
    </div>
  );
}

export function CardBody({ className, style, ...rest }: DivProps): React.ReactElement {
  return <div className={className} style={{ padding: "16px 20px", ...style }} {...rest} />;
}

export function CardFooter({ className, style, ...rest }: DivProps): React.ReactElement {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--border)", ...style }}
      {...rest}
    />
  );
}
