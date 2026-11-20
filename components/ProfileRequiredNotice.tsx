"use client";

import { ButtonLink } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";

/** Explains why write buttons are disabled; renders nothing when writes are allowed. Spacing comes from the parent stack. */
export function ProfileRequiredNotice({ className }: { className?: string }) {
  const { allowed, reason } = useWriteAllowed();
  if (allowed) return null;
  return (
    <InlineAlert
      tone="warning"
      className={className}
      action={
        <ButtonLink href="/profile" variant="secondary" size="sm">
          Go to profile
        </ButtonLink>
      }
    >
      {reason}
    </InlineAlert>
  );
}
