"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLink, SessionControls } from "@/components/shell/TopBarParts";

const ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/projects", label: "Projects" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicTopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="shell-topbar">
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 24px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "32px",
          }}
        >
          <BrandLink />
          <nav aria-label="Public navigation" style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
            {ITEMS.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="shell-link"
                  aria-current={active ? "page" : undefined}
                  style={active ? { color: "var(--text-primary)" } : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <SessionControls />
        </div>
      </div>
    </header>
  );
}
