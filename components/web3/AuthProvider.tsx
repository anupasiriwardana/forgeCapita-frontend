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
  if (err instanceof ApiError) {
    if (err.status === 403) return "Request origin is not allowed by the API.";
    return err.message;
  }
  return "Sign-in failed. Please try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<AuthUser | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | undefined>(undefined);
  const [signing, setSigning] = useState(false);
  const [errorState, setErrorState] = useState<{ address: string; message: string } | null>(null);
  const busyRef = useRef(false);
  const addressRef = useRef<string | undefined>(address);
  const hadSessionRef = useRef(false);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    hadSessionRef.current = session !== null;
  }, [session]);

  useEffect(() => {
    if (!address) {
      if (hadSessionRef.current) void logoutSession().catch(() => undefined);
      return;
    }
    const controller = new AbortController();
    fetchSession(controller.signal)
      .then(async (found) => {
        if (controller.signal.aborted) return;
        if (found && found.address.toLowerCase() !== address.toLowerCase()) {
          setSession(null);
          await logoutSession().catch(() => undefined);
        } else {
          setSession(found);
        }
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
  const loading = signing || (address !== undefined && checkedFor !== address);
  const error = errorState && errorState.address === address ? errorState.message : null;

  const signIn = useCallback(async (): Promise<boolean> => {
    const wallet = addressRef.current;
    if (!wallet || busyRef.current) return false;
    busyRef.current = true;
    setSigning(true);
    setErrorState(null);
    try {
      const { message } = await requestNonce(wallet);
      const signature = await signMessageAsync({ message });
      const verified = await verifySignature(wallet, signature);
      if (addressRef.current?.toLowerCase() !== wallet.toLowerCase()) return false;
      setSession(verified);
      return true;
    } catch (err) {
      setErrorState({ address: wallet, message: describeError(err) });
      return false;
    } finally {
      busyRef.current = false;
      setSigning(false);
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
