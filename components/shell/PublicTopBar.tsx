"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLink, SessionControls } from "@/components/shell/TopBarParts";
import { isActive } from "@/components/shell/navConfig";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";

const ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/projects", label: "Projects" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

function MobileMenu({ pathname }: { pathname: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" className="btn-ghost shell-icon-btn shell-public-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
        <Menu size={20} aria-hidden="true" />
      </button>
      <DialogContent title="Menu" description="Browse ForgeCapita." maxWidth={360}>
        <nav aria-label="Mobile navigation" className="shell-menu-list">
          {ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cx("shell-item", active && "shell-item-active")}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}

export function PublicTopBar(): React.ReactElement {
  const pathname = usePathname();
  return (
    <header className="shell-topbar shell-sticky">
      <div className="shell-bar shell-bar-public">
        <BrandLink />
        <nav aria-label="Public navigation" className="shell-nav-public">
          {ITEMS.map(({ href, label }) => (
            <Link key={href} href={href} className="shell-link" aria-current={isActive(pathname, href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="shell-bar-actions">
          <SessionControls />
          <MobileMenu pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

/** Neutral bar shown while a possible session is being checked, so signed-in users never see the public bar flash. */
export function PendingTopBar(): React.ReactElement {
  return (
    <header className="shell-topbar shell-sticky" aria-busy="true">
      <div className="shell-bar shell-bar-public">
        <BrandLink />
        <div className="shell-bar-actions">
          <Skeleton width={132} height={36} radius="var(--r-md)" />
          <span className="sr-only" role="status">
            Checking your session
          </span>
        </div>
      </div>
    </header>
  );
}
