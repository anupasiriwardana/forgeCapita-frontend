"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuth } from "@/components/web3/AuthProvider";

export function BrandLink() {
  return (
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
          color: "white",
          flexShrink: 0,
        }}
      >
        <Zap size={20} aria-hidden="true" />
      </div>
      <span
        className="shell-brand-text"
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
  );
}

/** Sign in button, error text and wallet button. Lands on the role home only after an explicit sign-in click. */
export function SessionControls() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { user, loading, error, signIn } = useAuth();
  const [landing, setLanding] = useState(false);

  const handledRef = useRef(true);

  useEffect(() => {
    if (!landing || !user || handledRef.current) return;
    handledRef.current = true;
    router.push(user.role === "staff" || user.role === "admin" ? "/admin" : "/portfolio");
  }, [landing, user, router]);

  async function handleSignIn(): Promise<void> {
    handledRef.current = false;
    if (await signIn()) setLanding(true);
    else handledRef.current = true;
  }

  return (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "10px" }}>
      {isConnected && !user && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void handleSignIn()}
          disabled={loading}
          title={error ?? undefined}
          style={{ padding: "6px 12px", fontSize: "13px" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      )}
      {error && !user && (
        <span role="alert" style={{ fontSize: "12px", color: "var(--rose)", maxWidth: "200px" }}>
          {error}
        </span>
      )}
      <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false} />
    </div>
  );
}
