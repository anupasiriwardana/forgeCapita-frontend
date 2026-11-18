"use client";

import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { EXPLORER_URLS } from "@/config/chains";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
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
    <div className="gasless-note">
      <StatusPill tone="accent">Gasless</StatusPill>
      <span>The platform pays the network fee for this action.</span>
      {!user && (
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" loading={loading} onClick={() => void signIn()}>
            Sign in to use gasless actions
          </Button>
          {error && (
            <InlineAlert tone="danger" className="btn-block">
              {error}
            </InlineAlert>
          )}
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
    <div style={{ fontSize: "13px" }}>
      {status && !failure && (
        <ol className="relay-steps" aria-label="Gasless request progress" style={{ listStyle: "none", padding: 0 }}>
          {STEPS.map((s, i) => {
            const reached = i <= current && !shown;
            return (
              <li
                key={s.status}
                className={`relay-step${reached ? " is-reached" : ""}${i === current && inFlight ? " is-current" : ""}`}
                aria-current={i === current && inFlight ? "step" : undefined}
              >
                {reached ? (
                  <CheckCircle2 size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                ) : (
                  <Circle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                )}
                {s.label}
                {reached && <span className="sr-only"> (done)</span>}
                {i < STEPS.length - 1 && <ChevronRight size={14} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-3)" }} />}
              </li>
            );
          })}
          {inFlight && status !== "CONFIRMED" && (
            <li>
              <Spinner size={12} label="Processing" />
            </li>
          )}
        </ol>
      )}
      {link && (
        <p className="tx-status" style={{ marginTop: 6 }}>
          Transaction:{" "}
          <a href={link.href} target="_blank" rel="noopener noreferrer" className="mono">
            {link.text}
          </a>
        </p>
      )}
      {pollError && !shown && status !== "CONFIRMED" && (
        <p className="panel-note" style={{ marginTop: 6 }}>{pollError}</p>
      )}
      {shown && (
        <InlineAlert
          tone="danger"
          className="relay-failure"
          action={
            onSelfPay && canFallbackToSelfPay(shown.code) ? (
              <Button variant="secondary" size="sm" onClick={onSelfPay}>
                Pay gas yourself
              </Button>
            ) : undefined
          }
        >
          {shown.message}
        </InlineAlert>
      )}
    </div>
  );
}
