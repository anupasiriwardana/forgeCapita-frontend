import {
  ArrowLeftRight,
  Banknote,
  Coins,
  FileText,
  FilePenLine,
  FolderKanban,
  GitBranch,
  LayoutGrid,
  ListChecks,
  MessageSquareWarning,
  Radio,
  Rocket,
  ScrollText,
  ShieldCheck,
  User,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
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

/** Sidebar groups for a role. The API enforces the same roles; this only shapes navigation. */
export function buildGroups(role: string): NavGroup[] {
  if (role === "staff" || role === "admin") {
    return [...adminGroups(role), { label: "Account", items: [PROFILE] }];
  }
  const groups: NavGroup[] = [
    {
      label: "Invest",
      items: [
        { href: "/portfolio", label: "Portfolio", icon: Wallet },
        { href: "/projects", label: "Marketplace", icon: LayoutGrid },
        { href: "/p2p", label: "P2P Market", icon: ArrowLeftRight },
      ],
    },
  ];
  const account: NavItem[] = [];
  if (role === "investor") account.push({ href: "/apply", label: "Become a founder", icon: Rocket });
  account.push(PROFILE);
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
  groups.push({ label: "Account", items: account });
  return groups;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Label of the nav item matching the path (longest match wins), or "ForgeCapita". */
export function pageTitle(pathname: string, role: string): string {
  let best: NavItem | null = null;
  for (const group of buildGroups(role)) {
    for (const item of group.items) {
      if (isActive(pathname, item.href) && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best ? best.label : "ForgeCapita";
}
