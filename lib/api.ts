/* ─────────────────────────────────────────────────────────────────────────
   lib/api.ts  –  Typed client for the Express REST API (/api/v1) + Ponder GraphQL
   ───────────────────────────────────────────────────────────────────────── */

import { chainCurrency } from "@/config/chains";

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
  shadowWalletId?: string;
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
  /** Stable machine code for errors that carry one (relay routes). */
  readonly code: string | undefined;

  constructor(status: number, message: string, requestId?: string, details?: unknown, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.details = details;
    this.code = code;
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST" || method === "PATCH") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${getExpressApi()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "include",
      signal,
    });
  } catch (err) {
    if (err instanceof TypeError && !signal?.aborted) {
      throw new ApiError(0, "Cannot reach the API. Check that it is running and try again.");
    }
    throw err;
  }

  if (res.status === 204) return undefined as T;

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok || !isRecord(json) || json.success !== true) {
    const err = isRecord(json) ? json : {};
    throw new ApiError(
      res.status,
      typeof err.error === "string" ? err.error : `Request failed (${res.status})`,
      typeof err.requestId === "string" ? err.requestId : undefined,
      err.details,
      typeof err.code === "string" ? err.code : undefined,
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

// ── Launch drafts (profile saved before the on-chain launch) ──────────────

export type LaunchDraftStatus = "pending" | "attached" | "applied" | "conflict" | "cancelled" | "expired";

export interface LaunchDraftInput {
  chainId: number;
  name: string;
  description: string;
  founderBio?: string;
  logoUrl?: string;
  websiteUrl?: string;
  pitchDeckUrl?: string;
  category?: string;
  shadowWalletId?: string;
}

export interface LaunchDraftDto {
  id: string;
  status: LaunchDraftStatus;
  chainId: number;
  shadowWalletId: string | null;
  createdAt: string;
}

export async function createLaunchDraft(body: LaunchDraftInput, signal?: AbortSignal): Promise<LaunchDraftDto> {
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "number" || (typeof value === "string" && value !== "")) clean[key] = value;
  }
  const data = await apiFetch<{ draft: LaunchDraftDto }>("/launch-drafts", { method: "POST", body: clean, signal });
  return data.draft;
}

export async function attachLaunchDraft(id: string, escrowAddress: string, signal?: AbortSignal): Promise<void> {
  await apiFetch<unknown>(`/launch-drafts/${encodeURIComponent(id)}/attach`, {
    method: "POST",
    body: { escrowAddress },
    signal,
  });
}

export async function cancelLaunchDraft(id: string, signal?: AbortSignal): Promise<void> {
  await apiFetch<unknown>(`/launch-drafts/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: {},
    signal,
  });
}

export interface MyLaunchDraftDto {
  id: string;
  status: LaunchDraftStatus;
  chainId: number;
  projectId: string | null;
  escrowAddress: string | null;
  name: string;
  createdAt: string;
  appliedAt: string | null;
}

export async function listMyLaunchDrafts(signal?: AbortSignal): Promise<MyLaunchDraftDto[]> {
  const data = await apiFetch<{ items: MyLaunchDraftDto[] }>("/launch-drafts/mine", { signal });
  return data.items;
}

export interface IndexerChainStatus {
  id: number;
  block: { number: number; timestamp: number };
}

export async function fetchIndexerStatus(signal?: AbortSignal): Promise<Record<string, IndexerChainStatus>> {
  const res = await fetch(`${getPonderApi()}/status`, { signal });
  if (!res.ok) throw new Error(`Indexer status failed (${res.status})`);
  return (await res.json()) as Record<string, IndexerChainStatus>;
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

// ── Applications and admin ────────────────────────────────────────────────

export type ApplicationStatus = "pending" | "approved" | "rejected";
export type ManagedRole = "founder" | "staff" | "investor";
export type UserRole = ManagedRole | "admin";

export interface ApplicationDto {
  id: string;
  walletAddress: string;
  projectName: string;
  summary: string;
  websiteUrl: string;
  pitchDeckUrl: string;
  repoUrl: string | null;
  contact: string | null;
  status: ApplicationStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  kycVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  reviewedBy?: string | null;
  kycVerifiedBy?: string | null;
}

export interface AdminUserDto {
  id: string;
  address: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApplicationInput {
  projectName: string;
  summary: string;
  websiteUrl: string;
  pitchDeckUrl: string;
  repoUrl?: string;
  contact?: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function submitApplication(
  body: ApplicationInput,
  signal?: AbortSignal,
): Promise<ApplicationDto> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" && value !== "") clean[key] = value;
  }
  const data = await apiFetch<{ application: ApplicationDto }>("/applications", {
    method: "POST",
    body: clean,
    signal,
  });
  return data.application;
}

export async function fetchMyApplication(signal?: AbortSignal): Promise<ApplicationDto | null> {
  const data = await apiFetch<{ application: ApplicationDto | null }>("/applications/mine", {
    signal,
  });
  return data.application;
}

export function listAdminApplications(
  params: { status?: ApplicationStatus; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Page<ApplicationDto>> {
  return apiFetch<Page<ApplicationDto>>(`/admin/applications${buildQuery(params)}`, { signal });
}

export async function getAdminApplication(id: string, signal?: AbortSignal): Promise<ApplicationDto> {
  const data = await apiFetch<{ application: ApplicationDto }>(
    `/admin/applications/${encodeURIComponent(id)}`,
    { signal },
  );
  return data.application;
}

export async function approveApplication(
  id: string,
  note?: string,
  signal?: AbortSignal,
): Promise<ApplicationDto> {
  const body: { kycVerified: true; note?: string } = { kycVerified: true };
  if (note) body.note = note;
  const data = await apiFetch<{ application: ApplicationDto }>(
    `/admin/applications/${encodeURIComponent(id)}/approve`,
    { method: "POST", body, signal },
  );
  return data.application;
}

export async function rejectApplication(
  id: string,
  note: string,
  signal?: AbortSignal,
): Promise<ApplicationDto> {
  const data = await apiFetch<{ application: ApplicationDto }>(
    `/admin/applications/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: { note }, signal },
  );
  return data.application;
}

export function listAdminUsers(
  params: { role?: UserRole; q?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Page<AdminUserDto>> {
  return apiFetch<Page<AdminUserDto>>(`/admin/users${buildQuery(params)}`, { signal });
}

export async function setUserRole(
  address: string,
  role: ManagedRole,
  signal?: AbortSignal,
): Promise<AdminUserDto> {
  const data = await apiFetch<{ user: AdminUserDto }>(
    `/admin/users/${encodeURIComponent(address.toLowerCase())}/role`,
    { method: "PATCH", body: { role }, signal },
  );
  return data.user;
}

/** Map an API/network error to a safe UI message; never exposes stacks or raw objects. */
export function describeApiError(err: unknown, fallback = "Something went wrong"): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 401) return "Please sign in";
  if (err.status === 403) return "You do not have permission for this action";
  if (err.status === 404) return "Not found";
  if (err.status === 400) {
    const fields = fieldDetails(err.details);
    return fields || err.message;
  }
  return err.message || fallback;
}

/** Like describeApiError but keeps the server message for 400/403/409 (founder eligibility rules). */
export function describeFounderError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError && (err.status === 400 || err.status === 403 || err.status === 409)) {
    return err.message || fallback;
  }
  return describeApiError(err, fallback);
}

// ── Founder agreement, shadow wallets, launch eligibility ─────────────────

export type ShadowWalletStatus = "pending" | "approved" | "rejected";

export interface AgreementDto {
  version: string;
  textHash: string;
  text: string;
  messageTemplate: string;
}

export interface ShadowWalletDto {
  id: string;
  address: string;
  status: ShadowWalletStatus;
  reviewNote: string | null;
  projectId: string | null;
  reserved: boolean;
}

export interface FounderMeDto {
  agreement: { version: string; acceptedAt: string } | null;
  wallets: ShadowWalletDto[];
}

export interface StaffShadowWalletDto {
  id: string;
  address: string;
  status: ShadowWalletStatus;
  reviewNote: string | null;
  userId: string;
  founderWallet: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface LaunchEligibilityDto {
  eligible: boolean;
  checks: {
    applicationApproved: boolean;
    agreementAccepted: boolean;
    shadowWalletAvailable: boolean;
  };
}

export function fetchAgreement(signal?: AbortSignal): Promise<AgreementDto> {
  return apiFetch<AgreementDto>("/agreement", { signal });
}

export function fetchFounderMe(signal?: AbortSignal): Promise<FounderMeDto> {
  return apiFetch<FounderMeDto>("/founders/me", { signal });
}

export function fetchLaunchEligibility(signal?: AbortSignal): Promise<LaunchEligibilityDto> {
  return apiFetch<LaunchEligibilityDto>("/founders/me/launch-eligibility", { signal });
}

export function acceptAgreement(
  body: { typedName: string; issuedAt: string; signature: string },
  signal?: AbortSignal,
): Promise<{ version: string; textHash: string; acceptedAt: string }> {
  return apiFetch("/founders/me/agreement", { method: "POST", body, signal });
}

export async function requestShadowWallet(address: string, signal?: AbortSignal): Promise<ShadowWalletDto> {
  const data = await apiFetch<{ shadowWallet: ShadowWalletDto }>("/founders/me/shadow-wallet", {
    method: "POST",
    body: { address },
    signal,
  });
  return data.shadowWallet;
}

export function listAdminShadowWallets(
  status: ShadowWalletStatus | undefined,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<Page<StaffShadowWalletDto>> {
  return apiFetch<Page<StaffShadowWalletDto>>(`/admin/shadow-wallets${buildQuery({ status, limit, offset })}`, {
    signal,
  });
}

export async function approveShadowWallet(id: string, note?: string, signal?: AbortSignal): Promise<void> {
  await apiFetch<unknown>(`/admin/shadow-wallets/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: note ? { note } : {},
    signal,
  });
}

export async function rejectShadowWallet(id: string, note: string, signal?: AbortSignal): Promise<void> {
  await apiFetch<unknown>(`/admin/shadow-wallets/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: { note },
    signal,
  });
}

// ── Staff: audit log, launch drafts, relay requests, relayer status ───────

export interface AuditLogEntryDto {
  id: string;
  actorUserId: string | null;
  action: string;
  target: string | null;
  before: string | null;
  after: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AdminLaunchDraftDto {
  id: string;
  userId: string;
  walletAddress: string;
  status: LaunchDraftStatus;
  chainId: number;
  founderWalletId: string | null;
  escrowAddress: string | null;
  projectId: string | null;
  name: string;
  createdAt: string;
  appliedAt: string | null;
}

export type RelayKind = "claim" | "stake" | "vote" | "execute";
export type RelayRequestStatus = "QUEUED" | "SENDING" | "SENT" | "CONFIRMED" | "FAILED" | "EXPIRED";

export interface AdminRelayRequestDto {
  id: string;
  kind: RelayKind;
  chainId: number;
  projectId: string;
  userId: string | null;
  account: string;
  status: RelayRequestStatus;
  errorCode: string | null;
  errorMessage: string | null;
  txHash: string | null;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  createdAt: string;
  sentAt: string | null;
  confirmedAt: string | null;
  expiresAt: string;
}

export type RelayBalanceBucket = "ok" | "low" | "empty" | "unknown";

export interface RelayChainStatus {
  chainId: number;
  enabled: boolean;
  relayerAddress?: string;
  balance?: RelayBalanceBucket;
}

export interface RelayStatusDto {
  enabled: boolean;
  chains: RelayChainStatus[];
}

export function listAuditLog(
  params: { limit?: number; offset?: number; action?: string; target?: string; actor?: string },
  signal?: AbortSignal,
): Promise<Page<AuditLogEntryDto>> {
  return apiFetch<Page<AuditLogEntryDto>>(`/admin/audit-log${buildQuery(params)}`, { signal });
}

export function listAdminLaunchDrafts(
  params: { limit?: number; offset?: number; status?: LaunchDraftStatus; userId?: string; chainId?: number },
  signal?: AbortSignal,
): Promise<Page<AdminLaunchDraftDto>> {
  return apiFetch<Page<AdminLaunchDraftDto>>(`/admin/launch-drafts${buildQuery(params)}`, { signal });
}

export function listAdminRelayRequests(
  params: {
    limit?: number;
    offset?: number;
    kind?: RelayKind;
    status?: RelayRequestStatus;
    chainId?: number;
    system?: "true";
    projectId?: string;
  },
  signal?: AbortSignal,
): Promise<Page<AdminRelayRequestDto>> {
  return apiFetch<Page<AdminRelayRequestDto>>(`/admin/relay-requests${buildQuery(params)}`, { signal });
}

export function fetchRelayStatus(signal?: AbortSignal): Promise<RelayStatusDto> {
  return apiFetch<RelayStatusDto>("/relay/status", { signal });
}

function fieldDetails(details: unknown): string {
  if (!Array.isArray(details)) return "";
  const parts: string[] = [];
  for (const item of details) {
    if (!isRecord(item) || typeof item.message !== "string") continue;
    parts.push(typeof item.path === "string" && item.path ? `${item.path}: ${item.message}` : item.message);
  }
  return parts.join("; ");
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

/** Indexer GET /projects/:chainId/:address/gas-ledger. All amounts are decimal wei strings. */
export interface GasSponsoredRow {
  id: string;
  chainId: number;
  /** Registry action kind: 0 claim, 1 stake, 2 vote, 3 execute. */
  action: number;
  account: string;
  relayer: string;
  cost: string;
  gasSpent: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
}

export interface GasDebtRow {
  id: string;
  chainId: number;
  kind: string;
  milestoneIndex: number | null;
  amount: string;
  outstanding: string | null;
  blockNumber: string;
  timestamp: string;
  txHash: string;
}

export interface GasLedgerResponse {
  chainId: number;
  projectId: string;
  summary: {
    actionCount: number;
    totalCost: string;
    /** Newest row's cumulative value, not a sum. */
    gasSpent: string;
    debtRecovered: string;
    debtWrittenOff: string;
    outstanding: string | null;
  };
  sponsored: GasSponsoredRow[];
  debt: GasDebtRow[];
}

/** Returns null when the indexer does not know the project yet (404). */
export async function fetchGasLedger(
  chainId: number,
  escrowAddress: string,
  params: { limit?: number; offset?: number; action?: number },
  signal?: AbortSignal
): Promise<GasLedgerResponse | null> {
  const qs = buildQuery(params);
  const res = await fetch(
    `${getPonderApi()}/projects/${chainId}/${encodeURIComponent(escrowAddress.toLowerCase())}/gas-ledger${qs}`,
    { headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit", signal }
  );
  if (res.status === 404) return null;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(json)) {
    throw new ApiError(
      res.status,
      isRecord(json) && typeof json.error === "string" ? json.error : `Request failed (${res.status})`
    );
  }
  return json as unknown as GasLedgerResponse;
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

/** Same as formatEth, suffixed with the native currency of the given chain. */
export function formatNative(wei: string | null | undefined, chainId: number, decimals = 4): string {
  return `${formatEth(wei, decimals)} ${chainCurrency(chainId)}`;
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
