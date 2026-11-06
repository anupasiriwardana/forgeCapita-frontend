"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
  ApiError,
  fetchSession,
  logoutSession,
  requestNonce,
  verifySignature,
  type AuthUser,
} from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  /** Resolves true when a session exists for the connected wallet afterwards. */
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGN_TIMEOUT_MS = 120_000;
const SIGN_TIMEOUT_MESSAGE = "Signature request timed out. Please try again.";

function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    (typeof e.message === "string" && /user rejected|user denied/i.test(e.message))
  );
}

function describeError(err: unknown): string {
  if (isUserRejection(err)) return "Signature request was rejected.";
  if (err instanceof Error && err.message === SIGN_TIMEOUT_MESSAGE) return SIGN_TIMEOUT_MESSAGE;
  if (err instanceof ApiError) {
    if (err.status === 403) return "Request origin is not allowed by the API.";
    return err.message;
  }
  return "Sign-in failed. Please try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, status } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<AuthUser | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | undefined>(undefined);
  const [signingFor, setSigningFor] = useState<string | undefined>(undefined);
  const [errorState, setErrorState] = useState<{ address: string; message: string } | null>(null);
  const busyRef = useRef(false);
  const addressRef = useRef<string | undefined>(address);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    busyRef.current = false;
    if (!address) return;
    const controller = new AbortController();
    fetchSession(controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        setSession(found && found.address.toLowerCase() === address.toLowerCase() ? found : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSession(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckedFor(address);
      });
    return () => controller.abort();
  }, [address]);

  const user =
    address && session && session.address.toLowerCase() === address.toLowerCase() ? session : null;
  const reconnecting = status === "connecting" || status === "reconnecting";
  const signing = address !== undefined && signingFor === address;
  const loading = reconnecting || signing || (address !== undefined && checkedFor !== address);
  const error = errorState && errorState.address === address ? errorState.message : null;

  const signIn = useCallback(async (): Promise<boolean> => {
    const wallet = addressRef.current;
    if (!wallet || busyRef.current) return false;
    busyRef.current = true;
    setSigningFor(wallet);
    setErrorState(null);
    try {
      const { message } = await requestNonce(wallet);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(SIGN_TIMEOUT_MESSAGE)), SIGN_TIMEOUT_MS);
      });
      let signature: string;
      try {
        signature = await Promise.race([signMessageAsync({ message }), timeout]);
      } finally {
        clearTimeout(timer);
      }
      const verified = await verifySignature(wallet, signature);
      if (addressRef.current?.toLowerCase() !== wallet.toLowerCase()) return false;
      setSession(verified);
      return true;
    } catch (err) {
      setErrorState({ address: wallet, message: describeError(err) });
      return false;
    } finally {
      busyRef.current = false;
      setSigningFor(undefined);
    }
  }, [signMessageAsync]);

  const signOut = useCallback(async (): Promise<void> => {
    setSession(null);
    setErrorState(null);
    await logoutSession().catch(() => undefined);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, role: user?.role ?? null, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
