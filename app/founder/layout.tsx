"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/web3/AuthProvider";

const STAFF_ROUTES = ["/founder/launch", "/founder/launches"];

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const staff = role === "staff" || role === "admin";
  const investor = user !== null && !staff && role !== "founder";

  useEffect(() => {
    if (investor) router.replace("/apply");
  }, [investor, router]);

  let content: React.ReactNode;
  if (loading && !user) {
    content = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else if (!user) {
    content = (
      <div className="alert alert-warning" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span>Please sign in</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>
          Sign in
        </button>
      </div>
    );
  } else if (role === "founder") {
    content = children;
  } else if (staff) {
    content = STAFF_ROUTES.includes(pathname) ? (
      children
    ) : (
      <div className="alert alert-warning">Founder tools are for founder accounts; staff are not gated.</div>
    );
  } else {
    content = (
      <div className="alert alert-warning">
        You need an approved founder application first.{" "}
        <Link href="/apply" style={{ color: "var(--brand-accent)" }}>Apply here</Link>
      </div>
    );
  }
  return <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 24px" }}>{content}</div>;
}
