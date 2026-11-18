"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";

interface InfoDialogProps {
  open: boolean;
  title: string;
  /** Main message; becomes the dialog's accessible description. */
  description: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Extra controls shown next to the close button. */
  actions?: ReactNode;
}

/** Modal with a single close action (information or notice). */
export function InfoDialog({ open, title, description, children, onClose, closeLabel = "Close", actions }: InfoDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            {actions}
            <Button onClick={onClose}>{closeLabel}</Button>
          </>
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

const SHADOW_WALLET_TEXT =
  "A shadow wallet is the revenue wallet of one project. It is bound to this project, and all income received by this wallet is monitored against the revenue the project reports to ForgeCapita. Handle the project's revenue through this wallet and no other wallet, and never use it for personal purposes.";

/** Text button that opens a dialog explaining the shadow wallet. */
export function ShadowWalletInfo() {
  return (
    <Dialog>
      <DialogTrigger className="text-btn">
        <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
        What is this?
      </DialogTrigger>
      <DialogContent
        title="What is a shadow wallet?"
        description={SHADOW_WALLET_TEXT}
        footer={
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        }
      />
    </Dialog>
  );
}
