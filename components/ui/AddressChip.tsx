"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { shortAddr } from "@/lib/api";

interface AddressChipProps {
  address: string;
  /** Optional explorer URL; rendered as a link opening in a new tab. */
  href?: string;
  copyable?: boolean;
  className?: string;
}

/** Short address in mono with an optional copy button; the full address is in the title and the accessible name. */
export function AddressChip({ address, href, copyable = true, className }: AddressChipProps): React.ReactElement {
  const short = shortAddr(address);
  const text = (
    <span className="mono" title={address} style={{ fontSize: 12 }}>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{address}</span>
    </span>
  );
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 4px 2px 8px",
        borderRadius: "var(--r-pill)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
        maxWidth: "100%",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
          {text}
        </a>
      ) : (
        text
      )}
      {copyable && <CopyButton value={address} label="Copy address" successMessage="Address copied" size={12} />}
    </span>
  );
}
