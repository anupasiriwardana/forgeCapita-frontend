"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuth } from "@/components/web3/AuthProvider";
import { shortAddr } from "@/lib/api";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/p2p", label: "P2P Market" },
  { href: "/projects/create", label: "Launch Project" },
];

export function Navbar() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const { user, role, loading, error, signIn, signOut } = useAuth();
  const links = [...NAV_LINKS];
  if (role === "investor" || role === "founder") links.push({ href: "/apply", label: "Apply" });
  if (role === "founder") links.push({ href: "/founder", label: "Founder" });
  if (role === "staff" || role === "admin") links.push({ href: "/admin", label: "Admin" });

  return (
    <header className="sticky top-0 z-40 w-full">
      <div
        style={{
          background: "rgba(5, 7, 15, 0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
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
          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", flexShrink: 0 }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
              }}
            >
              ⚡
            </div>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: "18px",
                background: "linear-gradient(135deg, #6366f1, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ForgeCapita
            </span>
          </Link>

          {/* Nav links */}
          <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                    textDecoration: "none",
                    transition: "all 0.15s",
                    color: active ? "#a78bfa" : "rgba(241, 245, 249, 0.7)",
                    background: active ? "rgba(99, 102, 241, 0.12)" : "transparent",
                    border: active ? "1px solid rgba(99, 102, 241, 0.25)" : "1px solid transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Connect Button */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "10px" }}>
            {isConnected && !user && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void signIn()}
                disabled={loading}
                title={error ?? undefined}
                style={{ padding: "6px 12px", fontSize: "13px" }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            )}
            {user && (
              <>
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
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void signOut()}
                  style={{ padding: "6px 12px", fontSize: "13px" }}
                >
                  Sign out
                </button>
              </>
            )}
            {error && !user && (
              <span role="alert" style={{ fontSize: "12px", color: "var(--rose)", maxWidth: "200px" }}>
                {error}
              </span>
            )}
            <ConnectButton
              chainStatus="icon"
              accountStatus="avatar"
              showBalance={false}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
