"use client";

import { useAuth } from "@/components/web3/AuthProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signIn } = useAuth();
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
  } else if (role !== "staff" && role !== "admin") {
    content = <div className="alert alert-warning">Staff access only</div>;
  } else {
    content = children;
  }
  return <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 24px" }}>{content}</div>;
}
