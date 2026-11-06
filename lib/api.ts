/* ─────────────────────────────────────────────────────────────────────────
   lib/api.ts  –  Typed client for the Express REST API (/api/v1) + Ponder GraphQL
   ───────────────────────────────────────────────────────────────────────── */

const ZERO = BigInt(0);
const DEFAULT_EXPRESS_ORIGIN = "http://localhost:3001";
const COMPOSITE_ID_REGEX = /^\d+:0x[a-fA-F0-9]{40}$/;

/** Strip trailing slashes and a legacy `/api` or `/api/v1` suffix so only the origin remains. */
function normaliseApiOrigin(raw: string): string {
  return raw.replace(/\/+$/, "").replace(/\/api(\/v1)?$/, "").replace(/\/+$/, "");
}

export function getExpressApi(): string {
  const configured =
    typeof window === "undefined"
      ? process.env.INTERNAL_EXPRESS_API || process.env.NEXT_PUBLIC_EXPRESS_API
      : process.env.NEXT_PUBLIC_EXPRESS_API;
  return `${normaliseApiOrigin(configured || DEFAULT_EXPRESS_ORIGIN)}/api/v1`;
}

export function getPonderApi(): string {
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_PONDER_API ||
      process.env.NEXT_PUBLIC_PONDER_API ||
      "http://localhost:42069"
    );
  }
  return process.env.NEXT_PUBLIC_PONDER_API || "http://localhost:42069";
}

// ── Types ─────────────────────────────────────────────────────────────────

export type ProjectState =
  | "FUNDING"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "SHUTDOWN";

/** Public profile; amounts elsewhere are decimal strings (wei). */
export interface ProfileDto {
  name: string;
  description: string;
  logoUrl: string | null;
  pitchDeckUrl: string | null;
  founderBio: string | null;
  websiteUrl: string | null;
  category: string | null;
  updatedAt: string;
}

export interface ProjectDto {
  /** Composite id `<chainId>:<escrow lowercase>`. */
  id: string;
  chainId: number;
  escrowAddress: string;
  tokenAddress: string;
  distributorAddress: string;
  developer: string;
  fundingGoal: string;
  totalRaised: string;
  fundingDeadline: string;
  closeGrace: string;
  refundWindow: string;
  votingPeriod: string;
  fundingClosedAt: string | null;
  platformFee: string | null;
  cancelledAt: string | null;
  shutdownAt: string | null;
  totalStaked: string;
  createdAt: string;
  isFundingActive: boolean;
  state: ProjectState;
  failedMilestoneIndex: number | null;
  isInvalidated: boolean;
  currentMilestoneIndex: number;
  tokenName: string;
  tokenSymbol: string;
  profile: ProfileDto | null;
}

export interface ProjectList {
  items: ProjectDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListProjectsParams {
  limit?: number;
  offset?: number;
  chainId?: 421614 | 97;
  state?: ProjectState;
  developer?: string;
  q?: string;
  category?: string;
  hasProfile?: boolean;
  sort?: "created_at" | "total_raised" | "funding_goal";
  order?: "asc" | "desc";
}

export interface ProfileInput {
  projectId: string;
  name: string;
  description: string;
  founderBio?: string;
  logoUrl?: string;
  pitchDeckUrl?: string;
  websiteUrl?: string;
  category?: string;
  shadowWallet?: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  milestoneIndex: number;
  isVotingOpen: boolean;
  isExecuted: boolean;
  votingEndTime: string | null;
  yesVotes: string;
  noVotes: string;
}

export interface P2PListing {
  /** Composite id `<chainId>:<listingId>` (the indexer's p2p_listing.id). */
  id: string;
  chainId: number;
  seller: string;
  tokenAddress: string;
  tokenAmount: string;
  priceInETH: string;
  status: "ACTIVE" | "FILLED" | "CANCELLED";
  buyer?: string | null;
  projectId?: string | null;
}

// ── Project id helpers ────────────────────────────────────────────────────

export function projectIdOf(chainId: number, escrow: string): string {
  return `${chainId}:${escrow.toLowerCase()}`;
}

export function parseProjectId(id: string): { chainId: number; escrow: `0x${string}` } {
  if (!COMPOSITE_ID_REGEX.test(id)) throw new Error("Invalid project id");
  const [chain = "", escrow = ""] = id.split(":");
  return { chainId: Number(chain), escrow: escrow as `0x${string}` };
}

// ── Express REST client ───────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(status: number, message: string, requestId?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST") headers["Content-Type"] = "application/json";

  const res = await fetch(`${getExpressApi()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "include",
    signal,
  });

  if (res.status === 204) return undefined as T;

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok || !isRecord(json) || json.success !== true) {
    const err = isRecord(json) ? json : {};
    throw new ApiError(
      res.status,
      typeof err.error === "string" ? err.error : `Request failed (${res.status})`,
      typeof err.requestId === "string" ? err.requestId : undefined,
      err.details,
    );
  }
  return json.data as T;
}

export function listProjects(params: ListProjectsParams = {}, signal?: AbortSignal): Promise<ProjectList> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return apiFetch<ProjectList>(`/projects${qs ? `?${qs}` : ""}`, { signal });
}

export function getProject(id: string, signal?: AbortSignal): Promise<ProjectDto> {
  return apiFetch<ProjectDto>(`/projects/${encodeURIComponent(id)}`, { signal });
}

/** Strict API body: send only schema keys, dropping undefined values and empty strings. */
export function upsertProfile(body: ProfileInput, signal?: AbortSignal): Promise<ProfileDto> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" && value !== "") clean[key] = value;
  }
  return apiFetch<ProfileDto>("/projects/profile", { method: "POST", body: clean, signal });
}

// ── Auth (cookie session; no tokens in JS) ────────────────────────────────

export interface AuthUser {
  id: string;
  address: string;
  role: string;
}

export interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

export function requestNonce(address: string, signal?: AbortSignal): Promise<NonceResponse> {
  return apiFetch<NonceResponse>("/auth/nonce", { method: "POST", body: { address }, signal });
}

export async function verifySignature(
  address: string,
  signature: string,
  signal?: AbortSignal,
): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>("/auth/verify", {
    method: "POST",
    body: { address, signature },
    signal,
  });
  return data.user;
}

/** Returns null when there is no valid session (401). */
export async function fetchSession(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<{ user: AuthUser }>("/auth/me", { signal });
    return data.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/** Logout answers 204 with no body. */
export async function logoutSession(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST", body: {} });
}

// ── Ponder GraphQL helpers ────────────────────────────────────────────────

async function ponderQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const ponderUrl = getPonderApi();
  const res = await fetch(`${ponderUrl}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Ponder query failed: ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

/** All amounts are decimal wei strings; `projectId` is the composite project id. */
export interface InvestorPosition {
  chainId: number;
  projectId: string;
  escrowAddress: string;
  state: string;
  tokenSymbol: string;
  invested: string;
  refunded: string;
  depositTokensClaimed: string;
  stakedBalance: string;
  yieldClaimed: string;
  tokensHeld: string;
  tokensClaimed: string;
}

export interface InvestorPositionsResponse {
  address: string;
  positions: InvestorPosition[];
  limit: number;
  offset: number;
}

export async function fetchInvestorPositions(
  address: string,
  params: { chainId?: number; limit?: number; offset?: number } = {},
  signal?: AbortSignal
): Promise<InvestorPositionsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  const res = await fetch(
    `${getPonderApi()}/investors/${encodeURIComponent(address)}/positions${qs ? `?${qs}` : ""}`,
    { headers: { Accept: "application/json" }, cache: "no-store", signal }
  );
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(json)) {
    throw new Error(
      isRecord(json) && typeof json.error === "string"
        ? json.error
        : `Request failed (${res.status})`
    );
  }
  return json as unknown as InvestorPositionsResponse;
}

/** `projectId` is the composite project id (equals the indexer's project.id). */
export async function fetchMilestonesByProject(
  projectId: string
): Promise<Milestone[]> {
  const query = `
    query MilestonesByProject($projectId: String!) {
      milestones(where: { projectId: $projectId }, orderBy: "milestoneIndex", orderDirection: "asc") {
        items {
          id
          projectId
          milestoneIndex
          isVotingOpen
          isExecuted
          votingEndTime
          yesVotes
          noVotes
        }
      }
    }
  `;
  try {
    const data = await ponderQuery<{ milestones: { items: Milestone[] } }>(query, {
      projectId,
    });
    return data.milestones?.items ?? [];
  } catch {
    return [];
  }
}

export async function fetchActiveListings(): Promise<P2PListing[]> {
  const query = `
    query ActiveListings {
      p2pListings(where: { status: "ACTIVE" }) {
        items {
          id
          chainId
          seller
          tokenAddress
          tokenAmount
          priceInETH
          status
          buyer
          projectId
        }
      }
    }
  `;
  try {
    const data = await ponderQuery<{ p2pListings: { items: P2PListing[] } }>(query);
    return data.p2pListings?.items ?? [];
  } catch {
    return [];
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────

/** Convert raw bigint-string wei value to a formatted ETH string */
export function formatEth(wei?: string | null, decimals = 4): string {
  if (!wei) return "0";
  const eth = Number(BigInt(wei)) / 1e18;
  return eth.toFixed(decimals);
}

/** Shorten an Ethereum address like 0x1234...abcd */
export function shortAddr(addr?: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Calculate funding progress percentage */
export function fundingProgress(raised?: string | null, goal?: string | null): number {
  if (!raised || !goal || BigInt(goal) === ZERO) return 0;
  const pct = (Number(BigInt(raised)) / Number(BigInt(goal))) * 100;
  return Math.min(100, Math.round(pct));
}
