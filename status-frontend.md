# ForgeCapita Frontend — Service Status & Technical Health Report

**Service:** `forgecapita-frontend` (Client-Side Web Application)  
**Framework:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS  
**Web3 Stack:** Wagmi 2.x / Viem 2.x / RainbowKit 2.x  
**Port:** 3000  
**Last Updated:** 2026-11-06  

**Current focus:** Step: WS-05.3d | State: awaiting-review | Updated: 2026-11-06. Code verified (tsc/lint clean); browser-unverified, main session to check after hot-reload. WS-05.3c also still awaiting runtime verification. Previous:  WS-05.3b reviewed and committed (user-reported); WS-03.4 / FE-12 done (user-reported); project list renders 8 live projects. Still open: FE-13b, FE-13c, FE-13e..h

---

## 1. Executive Summary

The `forgecapita-frontend` application provides the primary user interfaces for founders, investors, and platform administrators.

The core page layouts (Marketplace Dashboard, Project Detail, Milestone Voting, and P2P Secondary Market) have been scaffolded with high-fidelity glassmorphism aesthetics and active contract hooks. However, **a major network configuration mismatch, the absence of the Pre-Launch UI Gating pipeline, and missing role-specific dashboards (Admin, Founder, Investor) prevent end-to-end user workflows from operating as intended in `about.md`**.

---

## 2. Operational Features (Working)

- **Marketplace Dashboard (`app/page.tsx`):**
  - Successfully fetches unified projects from Express API (`GET /api/projects`) combining on-chain metrics with off-chain metadata.
  - Renders responsive `ProjectCard` grid with progress bars and status badges.
- **Project Detail & Funding Panel (`app/projects/[id]/page.tsx`):**
  - Displays detailed project statistics, founder bio, and on-chain contract addresses.
  - Allows backers to deposit ETH directly into the `MilestoneEscrow` contract with quick-select ETH amount buttons.
- **Milestone Governance & Voting (`app/projects/[id]/milestones/page.tsx`):**
  - Queries Ponder's GraphQL API (`fetchMilestonesByProject`) for real-time milestone states and vote weights.
  - Token holders can cast on-chain Yes/No votes calling `vote(bool support)` on the `MilestoneEscrow` contract.
- **P2P Secondary Market (`app/p2p/page.tsx`):**
  - Queries active listings from Ponder's GraphQL API.
  - Renders `P2PListingCard` items and supports buying tokens via `P2PExchange.fillListing(listingId)`.
  - Supports creating new listings via `P2PExchange.createListing(token, amount, price)`.

---

## 3. Critical Issues & Immediate Blockers

### A. Network & Chain Configuration Mismatch
- **Status:** **RESOLVED in config 2026-11-06 (WS-03.5a / FE-10)**: `config/wagmi.ts` now uses Arbitrum Sepolia and BSC Testnet with per-chain transports; `config/addresses.ts` holds the v2 addresses. Remaining: UI chain selection, and v1 pages still read `NEXT_PUBLIC_FACTORY_ADDRESS` / `NEXT_PUBLIC_P2P_ADDRESS` until WS-05.3. Not verified in a browser. The text below is the original (v1) problem description.
- **Problem:**
  - According to `about.md` and `forgecapita-indexer`, ForgeCapita contracts are deployed and verified on **Arbitrum Sepolia** (Chain ID `421614`) and **BSC Testnet** (Chain ID `97`).
  - However, `config/wagmi.ts` strictly configures **Ethereum Sepolia** (`sepolia`, Chain ID `11155111`):
    ```typescript
    chains: [sepolia],
    transports: { [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC) }
    ```
  - The deployed Factory address in `.env.local` (`0x0a7220D944960A6E12Cc91540bC6deCe53e9aC3c`) exists on Arbitrum Sepolia, NOT Ethereum Sepolia.
- **Impact:** Users connecting their wallets to Ethereum Sepolia will attempt to call addresses that do not exist on that network, resulting in reverted transactions and contract call failures.
- **Remedy Required:** Import `arbitrumSepolia` and `bscTestnet` from `wagmi/chains`, configure their transports in `config/wagmi.ts`, and provide multi-chain selection in the UI.

### B. Missing Pre-Launch UI Gating (`app/projects/create/page.tsx`)
- **Status:** **ARCHITECTURAL DISCONNECT** ⚠️
- **Problem:**
  - `about.md` Section 3.B explicitly mandates:
    > *"Founders submit an off-chain application to the API (`status = 'PENDING'`). The Next.js frontend disables the contract deployment workflow until a ForgeCapita Admin approves the profile (`status = 'APPROVED'`)."*
  - The current `app/projects/create/page.tsx` ignores this workflow completely. It directly executes `launchProject()` on-chain and only calls `/api/projects/profile` after the transaction succeeds.
- **Impact:** Any user can deploy contracts without prior admin review, defeating the platform's gating model and triggering rogue contract alerts.
- **Remedy Required:** Split the page into an Application Submission step and a Gated Deployment step that checks approval status before enabling the launch button.

### C. Missing Role-Specific Dashboards
- **Admin Dashboard (`/admin`):**
  - Missing completely. Admins have no UI to review pending applications, verify founder KYC, inspect rogue deployment alerts, or trigger `emergencyShutdown()`.
- **Founder Dashboard (`/founder`):**
  - Missing. Founders have no interface to view accumulated Paymaster gas debt, execute milestones with Paymaster signatures, register shadow wallets, or withdraw creator revenue from `RevenueRouter`.
- **Investor Dashboard (`/investor`):**
  - Missing. Backers have no consolidated view to claim tokens (`claimTokens()`), stake/unstake into `DividendDistributor`, claim real-time ETH dividends (`claimYield()`), or claim refunds on dead projects.

---

## 4. Incomplete Workflows & Feature Gaps

### A. Missing Paymaster Interception in Milestone Execution
- In `about.md` Section 2.C, developers execute milestones via `executeMilestone(uint256 gasDebt, bytes calldata signature)`.
- The frontend currently has no UI for developers to trigger milestone execution or fetch the required ECDSA signature from the backend API (`/api/paymaster`).

### B. Missing Token & Dividend Interactions
- Backers cannot claim their 80% proportional tokens after funding closes (`claimTokens()`).
- Investors cannot stake tokens into `DividendDistributor` to start earning their 75% dividend share or to acquire voting power.
- Investors cannot claim accrued ETH yield (`claimYield()`).
- Inactive or dead projects offer no refund claiming buttons (`refundFailedCrowdfund`, `refundDeadProject`).

### C. Plain URL Inputs vs. Direct File Uploads
- The creation form currently uses `<input type="url">` for `logoUrl` and `pitchDeckUrl`.
- Requires replacement with file upload components routing multipart data through the API to cloud storage.

---

## 5. Plan revision (2026-10-28)

The backlog was rewritten (`backlog-frontend.md`). Changes from what this report described:

- **Design system first:** dark theme with a black / luminous green / white palette, mobile-first shell, `/design` preview page before dashboards (FE-01 to FE-07).
- **Four dashboards:** investor, founder, **staff** and admin (FE-55 to FE-69); staff handle applications, KYC, complaints; admin keeps shutdown, freeze and takeover execution.
- **Accounts:** email + password and wallet linking replace wallet-only sign-in (FE-20 to FE-24).
- **Gasless UX:** claim tokens, stake, vote and execute milestone become sign-a-message actions with a gas tracker, queue status and clear free / paid labelling (FE-40 to FE-45). The old "fetch Paymaster signature then call `executeMilestone(gasDebt, signature)`" idea is dropped.
- **Founder wizard:** profile → manual KYC → "I agree" agreement → GitHub / GitLab repo → shadow wallet → review → gated deploy (FE-50 to FE-52).
- **Investor protection:** transparency panel, complaints, takeover signalling vote (FE-31, FE-72, FE-73).

## 6. Summary Checklist of Next Steps

1. [ ] FE-01 to FE-07 design system and app shell, reviewed on `/design`.
2. [ ] FE-10 to FE-12 multi-chain Wagmi config (Arbitrum Sepolia + BSC Testnet); `[USER-ACTION]` WalletConnect ID, RPCs, addresses.
3. [ ] FE-20 to FE-24 accounts, after the API accounts work exists.
4. [ ] FE-30 to FE-35 marketplace and project page; FE-40 to FE-45 gasless UX after contracts v2 and the relayer.
5. [ ] FE-50 to FE-52 founder wizard, then dashboards.

Re-plan 2026-11-01: the v1 hooks, ABIs, stubs and pages are discarded and rebuilt for v2; FE-10 is WS-03.5a, FE-13 is WS-05.3, FE-12 is only the WalletConnect ID and RPC URLs.

## Change log

2026-11-06  WS-05.3d (FE-13i, FE-13j)  ProjectCard badge now via displayState(project) with its own STATE_BADGE map (old isFundingActive badge removed) and teal chainName label beside the short address; milestones page vote totals are bigint, percentages by integer maths, `formatVotes` helper (formatUnits 18, max 4 decimals), no Number() on wei. Note: tsconfig target < ES2020, use BigInt(100) not 100n  - verified by: code reading of both files, npx tsc --noEmit 0 errors, npm run lint 0 errors 0 warnings, git diff --stat on package.json/lockfile empty. NOT verified: browser rendering

2026-11-06  WS-05.3c (FE-13c, FE-13e, FE-13f, FE-13g, FE-13h)  Closed, awaiting-review. lib/projectState.ts mirrors the indexer (fundingPhase/refundsOpenFor branch order, bigint compares; SHUTDOWN branch explicit but equivalent), displayState lets COMPLETED win; chainName() in config/chains.ts replaces bare 'Sepolia' labels; P2P card shows numeric listing id; milestone vote has wallet chain guard; unused imports removed. New backlog: FE-13i (ProjectCard still LIVE/CLOSED badge), FE-13j (chain badge on ProjectCard). MAIN-SESSION-REPORTED walkthrough ran on STALE code (WSL dev server on localhost:3000 did not pick up Windows-drive file changes): old code showed 8 list cards with no console errors, project detail renders, /p2p 0 listings (correct). The NEW code is NOT runtime-verified; user must restart the dev server in WSL and/or set WATCHPACK_POLLING=true  - verified by: npx tsc --noEmit 0 errors, npm run lint 0 errors 0 warnings, code reading, grep (no bare 'Sepolia' in app/ or components/; remaining mentions are 'Arbitrum Sepolia' via chain names); package.json/lockfile unchanged. The indexer's milestone votingEndTime column exists (ponder.schema.ts) and api.ts selects it; per-page diffs read only partly (git diff blocked by guard hook), not verified line by line

2026-11-06  WS-05.3b / WS-03.4 (FE-12)  USER-REPORTED: WS-05.3b reviewed and committed; user set their own frontend env (WalletConnect id, RPCs), started the frontend, connected a wallet on Arbitrum Sepolia, project list shows 8 projects (4 per chain, BSC projects already indexed; BSC backfill about 80%, Arbitrum caught up). FE-12 ticked, FE-13d/FE-13a runtime-confirmed for the list page  - verified by: user report only, not verified by Claude (no env read, nothing run)

2026-11-06  WS-05.3b (FE-13d, FE-13a)  `lib/api.ts` rewritten against `/api/v1` (typed client, ApiError, composite ids); `app/page.tsx`, `app/p2p/page.tsx`, `app/projects/[id]/page.tsx`, `.../milestones/page.tsx`, `app/projects/create/page.tsx`, `components/ProjectCard.tsx` adapted; create page uses parseEventLogs on ProjectLaunched; FE-13e..h added  - verified by: code reading against api types/projectSchemas, ABI event name, indexer p2p_listing columns; no snake_case project fields in app/components/lib; `npx tsc --noEmit` zero errors; `npm run lint` 0 errors, 2 warnings; git status shows only intended frontend files. NOT verified: GraphQL where status filter against a running indexer, wallet/browser behaviour, live API/indexer, build

2026-11-06  WS-05.3 (FE-13)  7 v2 ABI JSONs synced, generated `as const` `<Name>Abi.ts`, `scripts/generate-abis.mjs` + `npm run abis`, `lib/contracts.ts`; four pages moved to `getContractConfig`/`getAddresses`; launchProject passes `BigInt(totalSupply)` (no extra 10^18); FE-13a..d added  - verified by: node compare of artifact abi vs JSON vs .ts (all 7 identical); MilestoneFailed, CLOSE_GRACE, votingEndTime, voteBySig, claimTokensFor, stakeWithPermit present; launchProject args match Factory.sol; createListing/fillListing/vote match ABI; grep finds no NEXT_PUBLIC_FACTORY/P2P_ADDRESS or abis JSON imports in code; package.json diff is only the `abis` line, lockfile unchanged; `npx tsc --noEmit` only pre-existing lib/api.ts(219,44); `npm run lint` 0 errors, 2 warnings (unused imports in app/p2p/page.tsx). NOT verified: build, browser/wallet behaviour

2026-11-06  WS-03.5a (FE-10)  multi-chain wagmi config (421614, 97), `config/chains.ts`, `config/addresses.ts` (v2 addresses and start blocks), `.env.example`, `.gitignore` negation, README note; FE-10b added (raise tsconfig target to ES2020)  - verified by: addresses and start blocks compared character by character with deployments-v2.md; grep config/ for sepolia/SEPOLIA_RPC (only Arbitrum Sepolia); package files unchanged; `npx tsc --noEmit` only pre-existing lib/api.ts(219,44); `npm run lint` 0 errors, 3 pre-existing warnings. NOT verified: public RPCs reachable, wallet connection in a browser, build

2026-11-01  re-plan  v2-first re-plan approved by the user; backlog note added above FE-10, FE-10 -> WS-03.5a, FE-13 -> WS-05.3, FE-12 reduced; no code changed  - verified by: docs only, not verified against code
