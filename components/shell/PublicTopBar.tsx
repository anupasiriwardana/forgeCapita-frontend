"use client";

import Link from "next/link";
import { BrandLink, SessionControls } from "@/components/shell/TopBarParts";

export function PublicTopBar() {
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
            <Link href="/" className="shell-link">
              Projects
            </Link>
          </nav>
          <SessionControls />
        </div>
      </div>
    </header>
  );
}
