"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useAccount } from "wagmi";
import { useAuth } from "@/components/web3/AuthProvider";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { Footer } from "@/components/shell/Footer";
import { PendingTopBar, PublicTopBar } from "@/components/shell/PublicTopBar";
import { ChainIndicator, SessionControls, useSignInLanding } from "@/components/shell/TopBarParts";
import { pageTitle } from "@/components/shell/navConfig";
import { cx } from "@/components/ui/cx";

const COLLAPSE_KEY = "forgecapita.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, loading } = useAuth();
  const { status } = useAccount();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const [authResolved, setAuthResolved] = useState(false);
  useSignInLanding();

  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Latches after the first auth resolution, so later loading (for example signing in) never hides the public bar.
  if (!loading && !authResolved) setAuthResolved(true);

  useEffect(() => {
    // Read after mount (deferred) so server and first client render match.
    const timer = setTimeout(() => {
      try {
        if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
      } catch {
        // Storage unavailable: keep the default.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: preference is not persisted.
    }
  }, [collapsed]);

  const closeDrawer = useCallback(() => setOpen(false), []);

  if (!user) {
    // A wallet is (re)connecting and its session is still being checked: a session may exist.
    const sessionPending = loading && !authResolved && status !== "disconnected";
    return (
      <>
        {sessionPending ? <PendingTopBar /> : <PublicTopBar />}
        <main>{children}</main>
        {sessionPending ? null : <Footer />}
      </>
    );
  }

  return (
    <>
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} open={open} onClose={closeDrawer} />
      <div className={cx("shell-content", collapsed && "shell-content-collapsed")}>
        <header className="shell-topbar shell-sticky">
          <div className="shell-bar">
            <div className="shell-title">{pageTitle(pathname, user.role)}</div>
            <div className="shell-bar-actions">
              <ChainIndicator />
              <SessionControls />
              <button
                type="button"
                className="btn-ghost shell-icon-btn shell-hamburger"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
                aria-expanded={open}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </>
  );
}
