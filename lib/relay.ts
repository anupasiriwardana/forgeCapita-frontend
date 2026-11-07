/* ─────────────────────────────────────────────────────────────────────────
   lib/relay.ts  –  Gasless relayer client (/api/v1/relay) and status polling
   ───────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

export type RelayStatus = "QUEUED" | "SENDING" | "SENT" | "CONFIRMED" | "FAILED" | "EXPIRED";

export interface RelayRequest {
  id: string;
  kind: string;
  chainId: number;
  projectId: string;
  status: RelayStatus;
  errorCode: string | null;
  errorMessage: string | null;
  txHash: string | null;
  createdAt: string;
}

export interface RelayIntake {
  id: string;
  status: RelayStatus;
}

export interface RelayFailure {
  code: string | null;
  message: string;
}

export interface RelayVoteInput {
  projectId: string;
  support: boolean;
  deadline: number;
  signature: `0x${string}`;
}

export interface RelayStakeInput {
  projectId: string;
  /** Decimal wei string. */
  amount: string;
  deadline: number;
  signature: `0x${string}`;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_MS = 3 * 60_000;
const SIGNATURE_VALIDITY_SECONDS = 20 * 60;
const NETWORK_ERROR_CODE = "NETWORK_ERROR";
const USER_REJECTED_CODE = "USER_REJECTED";

export const RELAY_ERROR_MESSAGES: Record<string, string> = {
  RELAY_DISABLED: "Gasless actions are switched off right now.",
  SELF_PAY: "Gas sponsorship is not available for this action. Please pay the gas yourself.",
  ALREADY_VOTED: "This wallet has already voted.",
  NO_VOTING_POWER: "Stake tokens before voting.",
  VOTING_ENDED: "The voting period has ended.",
  VOTING_NOT_OPEN: "Voting is not open.",
  ALREADY_CLAIMED: "Tokens were already claimed.",
  NO_INVESTMENT: "No investment found for this wallet.",
  FUNDING_ACTIVE: "Funding is still active.",
  DEADLINE_EXPIRED: "The signature has expired. Please try again.",
  SIMULATION_FAILED: "The transaction would fail, so it was not sent.",
  GAS_TOO_HIGH: "Network fees are too high for sponsorship right now.",
  RELAY_UNAVAILABLE: "The relayer is temporarily unavailable.",
  [NETWORK_ERROR_CODE]: "Cannot reach the API. Check your connection.",
  [USER_REJECTED_CODE]: "Signature request was rejected.",
};

const SELF_PAY_CODES: ReadonlySet<string> = new Set([
  "RELAY_DISABLED",
  "SELF_PAY",
  "GAS_TOO_HIGH",
  "RELAY_UNAVAILABLE",
  NETWORK_ERROR_CODE,
]);

export function canFallbackToSelfPay(code: string | null | undefined): boolean {
  return code != null && SELF_PAY_CODES.has(code);
}

export function isTerminalStatus(status: RelayStatus): boolean {
  return status === "CONFIRMED" || status === "FAILED" || status === "EXPIRED";
}

/** Unix-seconds deadline for a signature requested now. */
export function newSignatureDeadline(): number {
  return Math.floor(Date.now() / 1000) + SIGNATURE_VALIDITY_SECONDS;
}

function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    (typeof e.message === "string" && /user rejected|user denied/i.test(e.message))
  );
}

/** Map any error thrown while preparing, signing or submitting a relay call to a safe message. */
export function describeRelayError(err: unknown): RelayFailure {
  if (isUserRejection(err)) return { code: USER_REJECTED_CODE, message: RELAY_ERROR_MESSAGES[USER_REJECTED_CODE] ?? "" };
  if (err instanceof ApiError) {
    const code = err.status === 0 ? NETWORK_ERROR_CODE : (err.code ?? null);
    const mapped = code ? RELAY_ERROR_MESSAGES[code] : undefined;
    if (mapped) return { code, message: mapped };
    if (err.status === 401) return { code, message: "Please sign in to use gasless actions." };
    return { code, message: err.message };
  }
  return { code: null, message: "Could not prepare the gasless request. Please try again." };
}

/** Failure of a finished request, or null while it is pending or confirmed. */
export function failureOfRequest(request: RelayRequest | null): RelayFailure | null {
  if (!request || (request.status !== "FAILED" && request.status !== "EXPIRED")) return null;
  const mapped = request.errorCode ? RELAY_ERROR_MESSAGES[request.errorCode] : undefined;
  const fallback =
    request.status === "EXPIRED" ? "The request expired before it was sent." : "The relayed transaction failed.";
  return { code: request.errorCode, message: mapped ?? request.errorMessage ?? fallback };
}

export function relayClaim(projectId: string, signal?: AbortSignal): Promise<RelayIntake> {
  return apiFetch<RelayIntake>("/relay/claim", { method: "POST", body: { projectId }, signal });
}

export function relayVote(input: RelayVoteInput, signal?: AbortSignal): Promise<RelayIntake> {
  return apiFetch<RelayIntake>("/relay/vote", { method: "POST", body: input, signal });
}

export function relayStake(input: RelayStakeInput, signal?: AbortSignal): Promise<RelayIntake> {
  return apiFetch<RelayIntake>("/relay/stake", { method: "POST", body: input, signal });
}

export async function getRelayRequest(id: string, signal?: AbortSignal): Promise<RelayRequest> {
  const data = await apiFetch<{ request: RelayRequest }>(`/relay/${encodeURIComponent(id)}`, { signal });
  return data.request;
}

export async function listRelayRequests(limit = 20, signal?: AbortSignal): Promise<RelayRequest[]> {
  const data = await apiFetch<{ items: RelayRequest[] }>(`/relay?limit=${limit}`, { signal });
  return data.items;
}

export interface UseRelayRequest {
  request: RelayRequest | null;
  /** Latest known status; QUEUED right after submission until the first poll answers. */
  status: RelayStatus | null;
  /** Set when polling gave up (timeout or an API error) while the request was still pending. */
  pollError: string | null;
  track: (id: string) => void;
  reset: () => void;
}

/** Polls GET /relay/:id every 3 s until the request is CONFIRMED, FAILED or EXPIRED (max ~3 minutes). */
export function useRelayRequest(): UseRelayRequest {
  const [id, setId] = useState<string | null>(null);
  const [request, setRequest] = useState<RelayRequest | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const track = useCallback((next: string): void => {
    setRequest(null);
    setPollError(null);
    setId(next);
  }, []);

  const reset = useCallback((): void => {
    setId(null);
    setRequest(null);
    setPollError(null);
  }, []);

  useEffect(() => {
    if (!id) return;
    const requestId = id;
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick(): Promise<void> {
      try {
        const next = await getRelayRequest(requestId,controller.signal);
        if (controller.signal.aborted) return;
        setRequest(next);
        if (isTerminalStatus(next.status)) return;
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          setPollError(describeRelayError(err).message);
          return;
        }
      }
      if (Date.now() - startedAt > POLL_MAX_MS) {
        setPollError("Still processing. Check again in a moment.");
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    }

    void tick();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [id]);

  const status: RelayStatus | null = request?.status ?? (id ? "QUEUED" : null);
  return { request, status, pollError, track, reset };
}
