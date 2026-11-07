"use client";

import { EXPLORER_URLS } from "@/config/chains";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  canFallbackToSelfPay,
  failureOfRequest,
  type RelayFailure,
  type RelayRequest,
  type RelayStatus as Status,
} from "@/lib/relay";

const STEPS: { status: Status; label: string }[] = [
  { status: "QUEUED", label: "Queued" },
  { status: "SENDING", label: "Sending" },
  { status: "SENT", label: "Sent" },
  { status: "CONFIRMED", label: "Confirmed" },
];

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

function stepIndex(status: Status | null): number {
  const i = STEPS.findIndex(s => s.status === status);
  return i < 0 ? 0 : i;
}

function txLink(chainId: number, hash: string | null): { href: string; text: string } | null {
  if (!hash || !TX_HASH_REGEX.test(hash)) return null;
  const base = (EXPLORER_URLS as Record<number, string | undefined>)[chainId];
  if (!base) return null;
  return { href: `${base}/tx/${hash}`, text: `${hash.slice(0, 10)}…${hash.slice(-6)}` };
}

/** Badge plus sign-in prompt shown above every gasless action. */
export function GaslessNotice() {
  const { user, loading, signIn, error } = useAuth();
  return (
    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
      <span className="section-tag" style={{ marginRight: "8px" }}>Gasless</span>
      The platform pays the network fee for this action.
      {!user && (
        <div style={{ marginTop: "8px" }}>
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => void signIn()}>
            Sign in to use gasless actions
          </button>
          {error && <span style={{ marginLeft: "8px", color: "var(--rose)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

interface RelayStatusProps {
  chainId: number;
  status: Status | null;
  request: RelayRequest | null;
  pollError: string | null;
  /** Failure raised before the request existed (signing or submission). */
  failure: RelayFailure | null;
  onSelfPay?: () => void;
}

/** Status steps, transaction link and mapped errors for one relayed action. */
export function RelayStatus({ chainId, status, request, pollError, failure, onSelfPay }: RelayStatusProps) {
  const shown = failure ?? failureOfRequest(request);
  const link = txLink(chainId, request?.txHash ?? null);
  const current = stepIndex(status);
  const inFlight = status !== null && !failure && !shown;

  if (!status && !failure) return null;

  return (
    <div style={{ marginTop: "12px", fontSize: "13px" }}>
      {status && !failure && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {STEPS.map((s, i) => (
            <span
              key={s.status}
              style={{
                color: shown ? "var(--text-muted)" : i <= current ? "var(--emerald)" : "var(--text-muted)",
                fontWeight: i === current && inFlight ? 700 : 400,
              }}
            >
              {i <= current && !shown ? "●" : "○"} {s.label}
              {i < STEPS.length - 1 ? " →" : ""}
            </span>
          ))}
          {inFlight && status !== "CONFIRMED" && <span className="spinner" style={{ width: "12px", height: "12px" }} />}
        </div>
      )}
      {link && (
        <div style={{ marginTop: "6px" }}>
          Transaction:{" "}
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {link.text}
          </a>
        </div>
      )}
      {pollError && !shown && status !== "CONFIRMED" && (
        <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>{pollError}</div>
      )}
      {shown && (
        <div className="alert alert-error" style={{ marginTop: "8px", fontSize: "13px" }}>
          <span>⚠️</span>
          <span>
            {shown.message}
            {onSelfPay && canFallbackToSelfPay(shown.code) && (
              <>
                {" "}
                <button type="button" className="btn-secondary" style={{ marginLeft: "8px" }} onClick={onSelfPay}>
                  Pay gas yourself
                </button>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
