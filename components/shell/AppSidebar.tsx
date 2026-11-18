"use client";

import Link from "next/link";
import { useEffect, type ReactElement } from "react";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { shortAddr } from "@/lib/api";
import { BrandLink } from "@/components/shell/TopBarParts";
import { buildGroups, isActive, type NavItem } from "@/components/shell/navConfig";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/cx";

/** Two hex characters after 0x, used as avatar initials. */
function addressInitials(address: string): string {
  const hex = address.startsWith("0x") ? address.slice(2) : address;
  return hex.slice(0, 2).toUpperCase() || "FC";
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Wraps a control in a right-side tooltip only while the sidebar is collapsed. */
function CompactTip({ compact, label, children }: { compact: boolean; label: string; children: ReactElement }): ReactElement {
  return compact ? (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

function SidebarLink({ item, active, compact, onNavigate }: { item: NavItem; active: boolean; compact: boolean; onNavigate: () => void }): ReactElement {
  const { href, label, icon: Icon } = item;
  return (
    <CompactTip compact={compact} label={label}>
      <Link
        href={href}
        onClick={onNavigate}
        aria-label={compact ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cx("shell-item", active && "shell-item-active")}
      >
        <Icon size={18} aria-hidden="true" />
        {!compact && <span>{label}</span>}
      </Link>
    </CompactTip>
  );
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ collapsed, onToggleCollapsed, open, onClose }: AppSidebarProps): ReactElement | null {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!user) return null;
  const groups = buildGroups(user.role);
  const compact = collapsed && !open;

  return (
    <>
      {open && <div className="shell-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={cx("shell-sidebar", compact && "shell-collapsed", open && "shell-open")}>
        <div className="shell-brand">
          <BrandLink />
        </div>
        <nav aria-label="Main navigation" className="shell-nav">
          {groups.map((group, i) => (
            <div key={group.label ?? `group-${i}`} className="shell-group">
              {group.label && !compact && <div className="shell-group-label">{group.label}</div>}
              {group.items.map((item) => (
                <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} compact={compact} onNavigate={onClose} />
              ))}
            </div>
          ))}
        </nav>
        <div className="shell-bottom">
          <div className="shell-user">
            <span className="shell-avatar mono" title={compact ? `${user.address} (${roleLabel(user.role)})` : undefined}>
              <span aria-hidden="true">{addressInitials(user.address)}</span>
              {compact && <span className="sr-only">{`Signed in as ${user.address}, role ${user.role}`}</span>}
            </span>
            {!compact && (
              <div className="shell-user-meta">
                <span className="mono shell-user-addr" title={user.address}>
                  <span aria-hidden="true">{shortAddr(user.address)}</span>
                  <span className="sr-only">{`Signed in as ${user.address}`}</span>
                </span>
                <StatusPill tone="accent">{roleLabel(user.role)}</StatusPill>
              </div>
            )}
          </div>
          <CompactTip compact={compact} label="Sign out">
            <Button
              variant="ghost"
              size="sm"
              className="shell-bottom-btn"
              onClick={() => void signOut()}
              aria-label={compact ? "Sign out" : undefined}
              leftIcon={<LogOut size={16} aria-hidden="true" />}
            >
              {!compact && "Sign out"}
            </Button>
          </CompactTip>
          <CompactTip compact={compact} label="Expand sidebar">
            <Button
              variant="ghost"
              size="sm"
              className="shell-bottom-btn shell-collapse-btn"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              leftIcon={collapsed ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
            >
              {!compact && "Collapse"}
            </Button>
          </CompactTip>
        </div>
      </aside>
    </>
  );
}
