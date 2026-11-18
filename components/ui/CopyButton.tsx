"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";

interface CopyButtonProps {
  value: string;
  /** Accessible name, for example "Copy address". */
  label: string;
  /** Toast text on success. */
  successMessage?: string;
  size?: number;
}

/** Icon-only copy button with an accessible name; confirms with a toast. */
export function CopyButton({ value, label, successMessage = "Copied", size = 14 }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(successMessage);
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        border: "none",
        borderRadius: 6,
        background: "transparent",
        color: copied ? "var(--success)" : "var(--text-3)",
        cursor: "pointer",
      }}
    >
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}
