"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Zap } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { chainName } from "@/config/chains";
import { WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";

const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = [421614, 97];

export function BrandLink(): React.ReactElement {
  return (
    <Link href="/" className="brand-link" aria-label="ForgeCapita home">
      <span className="brand-mark" aria-hidden="true">
        <Zap size={18} />
      </span>
      <span className="shell-brand-text" aria-hidden="true">
        ForgeCapita
      </span>
    </Link>
  );
}

/** Connected network as a dot plus name; warning tone when the wallet is on an unsupported chain. */
export function ChainIndicator(): React.ReactElement | null {
  const { isConnected, chainId } = useAccount();
  if (!isConnected || chainId === undefined) return null;
  const supported = SUPPORTED_CHAIN_IDS.includes(chainId);
  return (
    <span className={cx("shell-chain", !supported && "shell-chain-warning")} role="status">
      <span className="shell-chain-dot" aria-hidden="true" />
      <span className="sr-only">Network: </span>
      {supported ? chainName(chainId) : "Unsupported network"}
    </span>
  );
}

/**
 * Set while a sign-in started from the shell button is in flight. Module level because the public top bar
 * (and its SessionControls) unmounts as soon as the session appears, before signIn() resolves.
 */
let signInLandingPending = false;

/** Lands on the role home once, right after a sign-in started from the shell button; never on load or session restore. */
export function useSignInLanding(): void {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !signInLandingPending) return;
    signInLandingPending = false;
    router.push(user.role === "staff" || user.role === "admin" ? "/admin/applications" : "/portfolio");
  }, [user, router]);
}

/** Sign in button, error text and wallet button. The landing redirect runs in AppShell via useSignInLanding. */
export function SessionControls(): React.ReactElement {
  const { isConnected } = useAccount();
  const { user, loading, error, signIn } = useAuth();

  async function handleSignIn(): Promise<void> {
    signInLandingPending = true;
    if (!(await signIn())) signInLandingPending = false;
  }

  return (
    <div className="shell-session">
      {isConnected && !user && (
        <Button variant="secondary" size="sm" onClick={() => void handleSignIn()} disabled={loading} title={error ?? undefined}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      )}
      {error && !user && (
        // A cancelled signature is the user's own choice: a calm note, not a red alert.
        <span
          role={error === WALLET_CANCELLED_MESSAGE ? "status" : "alert"}
          className={error === WALLET_CANCELLED_MESSAGE ? "shell-session-note" : "shell-session-error"}
        >
          {error}
        </span>
      )}
      <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false} />
    </div>
  );
}
