"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { Footer } from "@/components/shell/Footer";
import { PublicTopBar } from "@/components/shell/PublicTopBar";
import { SessionControls } from "@/components/shell/TopBarParts";

const COLLAPSE_KEY = "forgecapita.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

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
    return (
      <>
        <PublicTopBar />
        <main>{children}</main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} open={open} onClose={closeDrawer} />
      <div className={`shell-content${collapsed ? " shell-content-collapsed" : ""}`}>
        <header className="sticky top-0 z-30 w-full">
          <div
            className="shell-topbar"
            style={{ height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}
          >
            <button
              type="button"
              className="shell-hamburger btn-secondary"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              style={{ padding: "6px 8px" }}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div style={{ marginLeft: "auto" }}>
              <SessionControls />
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </>
  );
}
