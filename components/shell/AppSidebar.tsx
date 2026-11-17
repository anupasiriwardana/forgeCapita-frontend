"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Banknote,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  FileText,
  FilePenLine,
  FolderKanban,
  GitBranch,
  MessageSquareWarning,
  Radio,
  ScrollText,
  UserCheck,
  Users,
  LayoutGrid,
  ListChecks,
  LogOut,
  Rocket,
  ShieldCheck,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { shortAddr } from "@/lib/api";
import { BrandLink } from "@/components/shell/TopBarParts";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const PROFILE: NavItem = { href: "/profile", label: "Profile", icon: User };

function adminGroups(role: string): NavGroup[] {
  const people: NavItem[] = [
    { href: "/admin/applications", label: "Applications", icon: FileText },
    { href: "/admin/wallets", label: "Shadow wallets", icon: Wallet },
  ];
  if (role === "admin") people.push({ href: "/admin/users", label: "Users", icon: Users });
  return [
    { label: "People", items: people },
    {
      label: "Launches",
      items: [
        { href: "/admin/drafts", label: "Launch drafts", icon: FilePenLine },
        { href: "/admin/takeover", label: "Takeover", icon: UserCheck },
      ],
    },
    {
      label: "Money",
      items: [
        { href: "/admin/compliance", label: "Compliance", icon: ShieldCheck },
        { href: "/admin/fees", label: "Platform fees", icon: Banknote },
        { href: "/admin/relay", label: "Relay", icon: Radio },
      ],
    },
    {
      label: "Oversight",
      items: [
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
        { href: "/admin/complaints", label: "Complaints", icon: MessageSquareWarning },
      ],
    },
  ];
}

function buildGroups(role: string): NavGroup[] {
  if (role === "staff" || role === "admin") {
    return [...adminGroups(role), { label: null, items: [PROFILE] }];
  }
  const main: NavItem[] = [
    { href: "/portfolio", label: "Portfolio", icon: Wallet },
    { href: "/projects", label: "Marketplace", icon: LayoutGrid },
    { href: "/p2p", label: "P2P Market", icon: ArrowLeftRight },
  ];
  if (role === "investor") main.push({ href: "/apply", label: "Become a founder", icon: Rocket });
  main.push(PROFILE);
  const groups: NavGroup[] = [{ label: null, items: main }];
  if (role === "founder") {
    groups.push({
      label: "Founder",
      items: [
        { href: "/founder/projects", label: "My projects", icon: FolderKanban },
        { href: "/founder/launch", label: "Launch project", icon: Rocket },
        { href: "/founder/launches", label: "My launches", icon: ListChecks },
        { href: "/founder/revenue", label: "Revenue", icon: Coins },
        { href: "/founder/repository", label: "Repository", icon: GitBranch },
        { href: "/founder/wallets", label: "Shadow wallets", icon: Wallet },
        { href: "/founder/takeover", label: "Takeover requests", icon: UserCheck },
        { href: "/founder/agreement", label: "Agreement", icon: FileText },
      ],
    });
  }
  return groups;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/projects") {
    return pathname === "/projects" || pathname.startsWith("/projects/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ collapsed, onToggleCollapsed, open, onClose }: AppSidebarProps) {
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
      <aside className={`shell-sidebar${compact ? " shell-collapsed" : ""}${open ? " shell-open" : ""}`}>
        <div className="shell-brand">
          <BrandLink />
        </div>
        <nav aria-label="Main navigation" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {groups.map((group, i) => (
            <div key={group.label ?? `group-${i}`} style={{ marginBottom: "12px" }}>
              {group.label && !compact && <div className="shell-group-label">{group.label}</div>}
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    title={compact ? label : undefined}
                    aria-label={compact ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`shell-item${active ? " shell-item-active" : ""}`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    {!compact && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="shell-bottom">
          {!compact && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "rgba(241,245,249,0.8)" }}>{shortAddr(user.address)}</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(99,102,241,0.15)",
                  color: "#a78bfa",
                }}
              >
                {user.role}
              </span>
            </div>
          )}
          <button
            type="button"
            className="shell-item"
            onClick={() => void signOut()}
            title={compact ? "Sign out" : undefined}
            aria-label="Sign out"
          >
            <LogOut size={20} aria-hidden="true" />
            {!compact && <span>Sign out</span>}
          </button>
          <button
            type="button"
            className="shell-item shell-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronsRight size={20} aria-hidden="true" /> : <ChevronsLeft size={20} aria-hidden="true" />}
            {!compact && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
