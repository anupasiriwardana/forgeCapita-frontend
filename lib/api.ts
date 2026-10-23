/* ─────────────────────────────────────────────────────────────────────────
   lib/api.ts  –  Data fetching helpers for Express REST + Ponder GraphQL
   ───────────────────────────────────────────────────────────────────────── */

export function getExpressApi(): string {
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_EXPRESS_API ||
      process.env.NEXT_PUBLIC_EXPRESS_API ||
      "http://localhost:3001/api"
    );
  }
  return process.env.NEXT_PUBLIC_EXPRESS_API || "http://localhost:3001/api";
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

export interface Project {
  // On-chain (from Ponder via JOIN)
  id: string;
  total_raised?: string;
  funding_goal?: string;
  is_funding_active?: boolean;
  is_deadlocked?: boolean;
  developer?: string;
  created_at?: string;
  // Off-chain (from startup_profiles)
  name?: string;
  description?: string;
  logo_url?: string;
  pitch_deck_url?: string;
  founder_bio?: string;
  website_url?: string;
}

export interface StartupProfileInput {
  projectId: string;
  name: string;
  description: string;
  logoUrl?: string;
  pitchDeckUrl?: string;
  founderBio?: string;
  websiteUrl?: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  milestoneIndex: number;
  isVotingOpen: boolean;
  isExecuted: boolean;
  yesVotes: string;
  noVotes: string;
}

export interface P2PListing {
  id: string;
  seller: string;
  tokenAddress: string;
  tokenAmount: string;
  priceInETH: string;
  isActive: boolean;
  buyer?: string | null;
}

// ── Express REST helpers ───────────────────────────────────────────────────

export async function fetchAllProjects(): Promise<Project[]> {
  try {
    const api = getExpressApi();
    const res = await fetch(`${api}/projects`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[fetchAllProjects] API returned ${res.status}: ${res.statusText}`);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.warn("[fetchAllProjects] Unable to reach API server:", err);
    return [];
  }
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  try {
    const api = getExpressApi();
    const res = await fetch(`${api}/projects/${id}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch (err) {
    console.warn(`[fetchProjectById] Unable to reach API for project ${id}:`, err);
    return null;
  }
}

export async function createStartupProfile(
  profile: StartupProfileInput
): Promise<Project> {
  const api = getExpressApi();
  const res = await fetch(`${api}/projects/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
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
      p2pListings(where: { isActive: true }) {
        items {
          id
          seller
          tokenAddress
          tokenAmount
          priceInETH
          isActive
          buyer
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
  if (!raised || !goal || BigInt(goal) === 0n) return 0;
  const pct = (Number(BigInt(raised)) / Number(BigInt(goal))) * 100;
  return Math.min(100, Math.round(pct));
}
