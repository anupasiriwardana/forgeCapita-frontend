# ForgeCapita Frontend — Development Backlog

This backlog tracks the Next.js 16 web app (`forgecapita-frontend`): design system, accounts and wallet linking, marketplace, project pages, **gasless action UX with a gas tracker**, user-paid on-chain flows, the founder application wizard, and four role dashboards (investor, founder, staff, admin).

> **Legend:**
> - `[x]` Completed
> - `[ ]` Pending
> - `[USER-ACTION]` Requires manual action or credential provisioning from the repository owner/user.
> - `[BLOCKED-BY]` Cannot start until another backlog item is done.
> - `[DEFERRED]` Planned, not scheduled.

Item IDs (`FE-xx`) are referenced from `ROADMAP.md`. Plan revised 2026-10-28.

## Decisions that shape this backlog

- **Theme:** dark, inspired by the Spectra Analytics Dashboard reference. Main colours are a shade of black, a luminous green and a shade of white. Tokens below are the starting point and live in `app/globals.css` as CSS variables.
- **Mobile first:** bottom tab bar on small screens, card lists instead of wide tables, 44 px touch targets, sticky transaction bar, 16–20 px radii.
- **Auth:** email + password account, then link a wallet. The browser never stores tokens in `localStorage`; the session is an httpOnly cookie handled by the API.
- **Gas UX:** claim tokens, stake, vote and execute milestone are gasless (sign a message in MetaMask, the relayer submits). Invest, claim yield, refund, create project, send revenue, unstake and P2P are normal wallet transactions. The UI must always say which kind of action the user is about to take.
- **Treasury actions** (emergency shutdown, freeze, takeover proposal) are signed by the admin in the browser wallet — the server holds no treasury key.

### Design tokens (initial)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0D0C` | page background |
| `--card` | `#131715` | surfaces |
| `--raised` | `#1B211E` | raised / hover surfaces |
| `--border` | `#27302B` | hairlines |
| `--text` | `#F2F6F4` | primary text |
| `--text-2` | `#A3AFA9` | secondary text |
| `--muted` | `#7F8B85` | muted text |
| `--green` | `#36F59B` | primary accent (hover `#6BFFB8`, text on green `#04140C`, tint `rgba(54,245,155,0.10)`) |
| `--amber` | `#F5B94A` | warnings |
| `--red` | `#FF6B7A` | errors / danger |
| `--info` | `#5CC8FF` | info |

Typography: Inter or Geist, monospace for addresses and hashes.

---

## Phase 0: Existing foundation

- [x] Next.js 16 (App Router) + TypeScript + Tailwind; glassmorphism dark styling in `globals.css`; RainbowKit / Wagmi / React Query providers; `Navbar` with `ConnectButton`.
- [x] Marketplace (`app/page.tsx`) with `ProjectCard` and `lib/api.ts` (`GET /api/projects`).
- [x] Project detail with funding panel (ETH deposit into `MilestoneEscrow`).
- [x] Milestones page: Ponder GraphQL query + on-chain `vote(support)`.
- [x] P2P page: listings from Ponder, `fillListing`, `createListing`.

## Phase 1: Design system & app shell

- [ ] **FE-01** Replace the glassmorphism styles with the token palette above (CSS variables, Tailwind theme mapping), dark-only at launch, contrast-checked (WCAG AA for text).
- [ ] **FE-02** Component library: Button, IconButton, Card, StatCard, Badge / StatusPill, Tabs, Table → responsive CardList, Modal / BottomSheet, Toast, Skeleton, EmptyState, Stepper, FormField, AddressChip (copy, explorer link), AmountInput, ProgressBar, Tooltip, Banner.
- [ ] **FE-03** `/design` preview page (non-production) showing every component, colour and state, so the theme can be reviewed before building dashboards.
- [ ] **FE-04** App shell: top bar on desktop, bottom tab bar on mobile, role-aware navigation, chain indicator, notification bell, footer with legal links and "testnet" notice.
- [ ] **FE-05** Theme RainbowKit's modal and button to the palette.
- [ ] **FE-06** Global error boundaries, loading states and 404 / 500 pages; consistent form validation (zod + react-hook-form) and inline errors.
- [ ] **FE-07** Security headers (CSP, frame-ancestors, referrer policy) in `next.config`; no secrets in client bundles; sanitise all rendered user content.

## Phase 2: Multi-chain Web3 configuration

> **Re-plan note (2026-11-01, user-approved):** the frontend is still v1. The v1 hooks, ABIs (`config/abis`), stubs (`config/stubs`) and v1 pages are DISCARDED and rebuilt against the deployed v2 contracts; no v1 compatibility. FE-10 becomes ROADMAP **WS-03.5a** (multi-chain Wagmi config with a per-chain v2 address map from `forgecapita-contracts/docs/deployments-v2.md`; public addresses go in code). FE-13 becomes **WS-05.3** (ABI sync and typed hooks; depends on WS-04 and WS-03.5a only). FE-12 is reduced to the WalletConnect Project ID and the per-chain RPC URLs (WS-03.4); contract addresses are no longer part of it.

- [x] **FE-10** Update `config/wagmi.ts` from Ethereum Sepolia to **Arbitrum Sepolia (421614)** and **BSC Testnet (97)**; per-chain transports and per-chain contract address map; remove `sepolia`.
  - Done 2026-11-06: `config/chains.ts`, `config/addresses.ts` (`getAddresses` returns `undefined` for an unsupported chain), `config/wagmi.ts`, `.env.example`, `.gitignore` negation, README note. Not verified: public RPCs reachable, wallet connection in a browser, build.
- [ ] **FE-10b** Raise `tsconfig` target from ES2017 to ES2020. `config/addresses.ts` uses `BigInt("...")` instead of bigint literals because of TS2737; the raise would also clear the pre-existing error at `lib/api.ts(219,44)`.
- [ ] **FE-11** Chain switcher / indicator in the shell; wrong-network prompt with one-tap switch.
- [x] **FE-12 `[USER-ACTION]`** WalletConnect Project ID (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`) and dedicated RPC URLs per chain. (Reduced 2026-11-01: contract addresses moved into code at FE-10 / WS-03.5a.)
  - Ticked 2026-11-06 on USER REPORT (not verified by Claude; `.env*` never read): user set their own frontend env and connected a wallet on Arbitrum Sepolia.
- [x] **FE-13** Sync v2 ABIs with `node .claude/scripts/sync-abi.js frontend <Contract>`; typed contract hooks per chain. `[BLOCKED-BY]` contracts v2.
  - Done 2026-11-06 (WS-05.3, lean): 7 v2 ABI JSONs equal the compiled artifacts, generated `<Name>Abi.ts` (`as const`) via `npm run abis`, `lib/contracts.ts` (`ABIS`, `getContractConfig`), four v1 pages moved off `NEXT_PUBLIC_FACTORY_ADDRESS` / `NEXT_PUBLIC_P2P_ADDRESS` and JSON imports; launchProject supply scaling fixed. Not verified: build, browser or wallet behaviour.
- [x] **FE-13a** Create page: read the new project from the receipt with `parseEventLogs` on `ProjectLaunched` (replace the receipt hack); `createStartupProfile` must send the composite project id `<chainId>:<escrow lowercase>` to `POST /api/v1/projects/profile` (chain_id and escrow are derived server-side).
  - Done 2026-11-06 (WS-05.3b): `waitForTransactionReceipt` + `parseEventLogs` reading `args.milestoneEscrow`, `projectIdOf` lowercase composite id, redirect to `/projects/<encoded id>`. Not verified: wallet/browser run.
- [x] **FE-13e** (done 2026-11-06, code-verified; runtime pending dev-server restart) Replace cosmetic "Sepolia" labels (`app/page.tsx`, `app/projects/[id]/page.tsx` Network row, `app/p2p/page.tsx`, create page text, layout metadata) with the project's chain (`project.chainId`).
- [x] **FE-13f** (done, code-verified) P2P card shows the composite id as "Listing #"; show only the numeric part.
- [x] **FE-13g** (done, code-verified: walletChainId vs project chain guard in milestones page) Milestone vote has no wallet chain check against the project's chain; add a guard and switch prompt.
- [x] **FE-13h** (done, lint 0 warnings) Remove unused imports `shortAddr`, `formatEth` in `app/p2p/page.tsx` (lint warnings).
- [x] **FE-13b** P2P `createListing`: send the token `approve` to the exchange first. (done 2026-11-06, code verified, tsc/lint clean, runtime NOT verified)
- [ ] **FE-13k** FundingPanel marks success before the transaction receipt; await the receipt first.
- [ ] **FE-13l** p2p allowance read in `handleCreate` uses the wallet's current chain; pass an explicit chainId.
- [ ] **FE-13m** InvestorPanel `useReadContracts` uses allowFailure, so a failed read shows 0; surface read errors.
- [x] **FE-13c** Status-rule helpers: `completed` first (never show a completed project as cancelled), `fundingPhase` with `CLOSE_GRACE`, show `votingEndTime`. (done 2026-11-06: `lib/projectState.ts` mirrors the indexer's fundingPhase/refundsOpenFor; used on project detail and milestones page; runtime NOT verified, see status)
- [x] **FE-13i** (done 2026-11-06, code verified, browser-unverified) `components/ProjectCard.tsx` still uses the old isFundingActive LIVE/CLOSED badge; switch to `displayState` / `fundingPhase`.
- [x] **FE-13j** (done 2026-11-06, code verified, browser-unverified) Show a chain badge on `ProjectCard` (list shows 4 projects per chain with identical names, e.g. 'Smoke Alpha' twice, indistinguishable).
- Note: tsconfig target is below ES2020, so bigint literals (`100n`) do not compile; use `BigInt(100)`. (FE-10b would lift this.) Milestones page vote totals now bigint with `formatVotes` (formatUnits 18, max 4 decimals).
- [x] **FE-13d** (runtime-confirmed 2026-11-06, user-reported: project list shows 8 projects from the live API/indexer, 4 per chain) Rewrite `lib/api.ts` against `/api/v1`: `GET /api/v1/projects` returns `{ items, total, limit, offset }` with camelCase fields and bigint strings; current shapes are v1. Needed before any page that lists projects works.
  - Done 2026-11-06 (WS-05.3b): typed `listProjects`/`getProject`/`upsertProfile`, `ApiError`, composite id helpers, `ProjectDto` equals the API type; five pages and `ProjectCard` adapted. Not verified: GraphQL `where status` filter against a running indexer, live API/indexer, browser.
- [ ] **FE-14** Transaction toast system (submitting → pending → confirmed → failed) with explorer links; sticky transaction bar on mobile.

## Phase 3: Accounts & roles

- [ ] **FE-20** Sign up, log in, log out, email verification result, forgot / reset password pages; generic error messages; password strength meter.
- [ ] **FE-21** Account and security page: change password, TOTP enrolment (QR + recovery codes), active sessions, linked wallet.
- [ ] **FE-22** Link-wallet flow: connect → request nonce → sign message → confirm; show the linked address and warn when the connected wallet differs from the linked one.
- [ ] **FE-23** Route guards and role-aware redirects (server-side check in middleware / layouts); "forbidden" and "2FA required" screens for staff and admin.
- [ ] **FE-24** Authenticated API client: cookie credentials, CSRF header, automatic 401 handling.
  - Partial 2026-11-06 (WS-06.3w): cookie credentials done (`apiFetch` `credentials: "include"`, 204 handled). CSRF header and global 401 handling remain.

### Wallet sign-in (WS-06.3w, lean wallet-first re-plan)
> FE-25..28 runtime-verified by the user 2026-11-06 (sign-in, admin badge, reload persistence, wallet switch, CORS; user-reported, not verified by Claude).
- [x] **FE-25** `lib/api.ts` auth client: `requestNonce`, `verifySignature`, `fetchSession` (401 -> null), `logoutSession` against `/api/v1/auth/*` (verified vs authController: paths, bodies, envelope, 204 logout).
- [x] **FE-26** `AuthProvider` / `useAuth` (`components/web3/AuthProvider.tsx`): session check on mount and address change, fresh nonce per sign-in with the message signed verbatim, address mismatch/disconnect -> signed out, double-click guard, no token or localStorage handling.
- [x] **FE-27** Navbar session indicator: Sign in button, short address + role badge, Sign out.
- [x] **FE-28** Create page: sign in before the profile step; profile POST retries only on 404 (5 x 3.5 s, "Waiting for indexer (n/5)"); 401/403 not retried.
- [ ] **FE-66** (new, WS-07.5m) Fee buffer (`getFeeOverrides`) is applied per write site; consider a shared wrapper hook. Create page post-launch `if (!user) signIn()` is unreachable/harmless, remove when touched.
- [ ] **CON (new, WS-07.5m)** Factory is permissionless: anyone can call `launchProject` directly and skip the website founder gate. Consider an on-chain founder allowlist/registry check (contracts backlog); the website gate only controls the normal path.
- [ ] **API note (new, WS-07.5m)** Shadow wallet != login wallet rule is API-enforced only against the login wallet, not against other founders' personal wallets.
- [x] **FE-90** (DONE 2026-11-06 WS-07.6b, code read + tsc 0/lint clean; package files unchanged; runtime NOT verified) Launch drafts in the create page: draft saved and wallet reserved before MetaMask, then launchProject, attach (4 retries x 3 s), poll project (10 x 3 s); draft cancelled on rejection / pre-hash error / revert, kept when the receipt wait fails; calm 'on-chain and will appear shortly' panel with 'Launch another project'; double-submit guard; `lib/api.ts` createLaunchDraft/attachLaunchDraft/cancelLaunchDraft/listMyLaunchDrafts; /founder shows 'Reserved (launch pending)' with project link. Open: `listMyLaunchDrafts` is unused (no resume UI after a reload).
- [x] **FE-29** (SUPERSEDED 2026-11-06 WS-07.6b by FE-90: the 'Save profile now' / 'Start over' / `pendingProfile` path was removed; was DONE 2026-11-06 WS-07.5n, code read + tsc/lint; runtime NOT verified; `pendingProfile` keeps the payload in page state only, lost on reload; see FE-86) Create page: separate "retry profile only" action. Today a failed sign-in or profile save shows an error, and resubmitting the form would launch a second project on-chain.
- [x] **FE-26a** (WS-07.5l 2026-11-06, code verified, runtime NOT verified; heuristic: `AuthProvider` holds loading while wagmi is `disconnected` until a 1500 ms settle timer fires) Treat the wagmi pre-reconnect `disconnected` status as loading (hydration) in `AuthProvider`/pages: a split-second "sign in" flash remains on /admin and /apply after refresh. (Not FE-34: that ID is P2P additions.)
- [x] **FE-86** (DONE 2026-11-06 WS-07.5o, code read + tsc/lint; runtime NOT verified) Project page 'Project profile' form (`components/ProfileEditor.tsx`, rendered in `app/projects/[id]/page.tsx`) for the project's developer and staff/admin, so a profile can be saved or fixed after launch (the create-page retry state is lost on reload; stranded project 421614:0xa0891a58a00a75ed04f6a3e6ba74885348bf63d3 has no UI path yet). Founder with no profile picks an approved free shadow wallet (sends only `shadowWalletId`); save retries 404 8x4 s.
  - [x] Indexer lag line done on /launches only (FE-91, shown when lag >= 2 min); not on the project page.
- [x] **FE-91** (DONE 2026-11-07 WS-07.7, code read + tsc 0/lint clean; package files unchanged; runtime NOT verified) `/launches` 'My launches' page (`app/launches/page.tsx`, Navbar link for founder/staff/admin, 'View my launches' link on the create page panel): drafts newest first with status badge and explanation, Cancel for pending (confirm, 409 refetch), Refresh, 15 s auto-refresh while pending/attached, Ponder `/status` lag line (`fetchIndexerStatus`) when lag >= 2 min. Resolves the FE-90 'listMyLaunchDrafts unused' gap.
- [x] **FE-92** (added 2026-11-07; read part done 2026-11-08, WS-11.2b; code verified vs adminSchemas/adminController, tsc 0, lint clean, runtime NOT verified) Staff view of all launch drafts (cross-ref API-104). `/admin` Launch drafts tab (`components/admin/LaunchDraftsTab.tsx`), read-only.
  - Remaining (new items below): staff cancel of stuck drafts UI (needs API-130).
- [ ] **FE-109** (added 2026-11-08) Staff cancel/release of stuck launch drafts UI (WS-11.2c; needs API-130 write endpoint).
- [ ] **FE-110** (added 2026-11-08) Admin tabs extras: Relay tab projectId filter input; date-range filters (API-133); link audit targets to /founder or user pages; export CSV.
- [ ] **FE-87** (added 2026-11-06) ProfileEditor cannot clear optional fields back to empty (`upsertProfile` drops empty strings).
- [ ] **FE-88** (added 2026-11-06) A founder-developer whose profile exists but has no wallet bound (e.g. staff-created) cannot bind from the ProfileEditor (public DTO hides the binding, API would 400); staff must bind. Needs a design decision.
- [ ] **FE-89** (added 2026-11-06) The 404 retry helper was duplicated in `ProfileEditor.tsx` and `app/projects/create/page.tsx`; after WS-07.6b the create page no longer saves a profile, so the retry helper now lives only in `ProfileEditor.tsx` (dedupe no longer needed; the create page has its own attach/index polling).
- [ ] **FE-30** Auth error messages: dedicated 403 text. Currently any 403 shows "Request origin is not allowed by the API." although it can also be a role/ownership refusal.
- Runtime NOT verified (needs a wallet, running api with ADMIN_WALLETS and CORS_ORIGINS including http://localhost:3000).
- Fix WS-07.3l/4l-fix (2026-11-06, code verified, runtime not verified): AuthProvider no longer logs out on wallet change/disconnect (only explicit signOut), signing keyed per wallet, 120 s signature timeout, loading while wagmi reconnects. Note on FE-26: "address mismatch/disconnect -> signed out" now means signed out locally only; the server session is not revoked.
- [ ] **FE-31** Investigate RainbowKit connect button flicker/missing on refresh (likely wagmi reconnect/hydration in WSL dev).
- [ ] **FE-32** Session left valid on wallet switch: the previous wallet's cookie session stays valid on the server until idle/absolute expiry or explicit sign out. Revoke other sessions of the same browser on verify, or add "sign out everywhere" (api + frontend).
- [ ] **FE-33** Ask user: why one wallet showed 'founder' before any approval (likely a role set earlier via Users in a previous test); unresolved, not investigated.

## Phase 4: Marketplace & project pages

- [x] **FE-30** Marketplace filters: category, chain, status, search; sorting; pagination; skeleton loading; mobile filter sheet.
  - USER-VERIFIED 2026-11-10 (user-reported 'works', not verified by Claude).
  - Done 2026-11-09 (WS-09.1: `lib/marketplaceFilters.ts`, `components/MarketplaceFilters.tsx`, `app/page.tsx`; URL-driven, params validated against the API schema; code verified, runtime NOT verified). Simplification: mobile sheet is a collapsible Filters panel, collapsed at all widths; clearing the search by hand may drop focus once.
- [ ] **FE-31** (PARTIAL 2026-11-09 WS-10.C: `components/TransparencyPanel.tsx` on the project page, public, shows state badge, shadow wallet, last checked, observed vs routed, shortfall; unaudited chains show the API note; frozen flag hidden (API returns null); code verified, runtime NOT verified; remaining: the rest of the redesign) Project detail redesign: funding progress, milestones timeline, team, repo link, contract addresses (with explorer links), **Transparency panel** (approved shadow wallet shown permanently, compliance state, last reconciliation, deposits vs observed, freeze flag).
- [x] **FE-32** Investor actions on the project page: invest (user-paid), **claim tokens (gasless)**, stake / unstake, claim yield, refund buttons (`refundFailedCrowdfund`, `refundDeadProject`) with state checks and clear "you pay gas" / "free" labels.
  - User-paid parts done 2026-11-06 (`components/InvestorPanel.tsx`: stake with approve, unstake with vote-lock block, claim yield, both refunds, "you pay gas" labels; code verified, runtime NOT verified). Gasless claim tokens + gasless stake (Permit) + pay-gas fallbacks done 2026-11-07 (WS-08.3L; code verified against the api and contracts, runtime NOT verified).
- [ ] **FE-33** Voting UI (gasless): show staked voting power (`DividendDistributor.stakedBalance`), vote-lock warning (`isUserVoteLocked`), vote progress vs quorum, time remaining, queued state.
  - Gasless vote button + request status done 2026-11-07 (WS-08.3L). Remaining: confirm staked voting power / vote-lock warning / quorum progress display exists (not re-checked in this step).
- [x] **FE-34** (WS-09.4 2026-11-09, code verified, runtime NOT verified; approval step was already FE-13b, untouched) P2P additions: token approval step before listing, cancel listing, trade history, fee display.
  - Done: cancel own listing (ConfirmDialog, seller/chain checks, cancelListing, receipt check); fee display (1% fee and seller proceeds on card, live 'You receive about' in Create Listing, bigint math); Recent trades table from indexer `p2pTrades` (explorer link validated, 'No trades yet', lag note).
  - Remaining: none for FE-34; per-project trade history on the project page may be added with WS-09.2.
  - USER-VERIFIED 2026-11-10 (user-reported, not verified by Claude): cancel, fee display, trades and wrong-network handling work on /p2p.
- [x] **FE-123** (done 2026-11-10, code read; runtime NOT verified) (added 2026-11-10, WS-09.4b; BUG) /p2p shows token amounts as raw wei (a 10,000 token listing renders 10,000,000,000,000,000,000,000). Cards (`P2PListingCard.tsx` uses `Number(listing.tokenAmount).toLocaleString()`), Recent trades (`formatEth(t.tokenAmount, 2)`), and any modal/volume text must format wei with 18 decimals via a bigint-safe helper (viem `formatUnits`, group thousands, trim trailing zeros). No `Number()` on wei, no bigint literals (tsconfig target below ES2020, use `BigInt(0)`).
- [x] **FE-124** (done 2026-11-10, code read; runtime NOT verified; manual-address fallback included) (added 2026-11-10, WS-09.4b; UX) Create Listing token picker: replace the pasted token address with a list of the connected wallet's project tokens (addresses from the project list, `balanceOf` via `useReadContracts` on the connected chain), hide zero balances, show the unstaked wallet balance, selecting fills the address, Max button fills the amount; manual address fallback only if trivial. Approval step stays untouched.
- [x] **FE-125** (done 2026-11-10, code read; runtime NOT verified; reconciles on indexer fetch, 10 min expiry) (added 2026-11-10, WS-09.4b; PERF) Optimistic P2P state after create/cancel/buy receipts: read the new listing from the chain (`ListingCreated` log from the receipt, or `nextListingId`/`listings(id)`), merge it into the displayed list by composite id `<chainId>:<listingId>`, dedupe against indexer listings, drop cancelled/filled ids from view, reconcile when the indexer catches up.
  - USER-VERIFIED 2026-11-10 (user-reported, not verified by Claude): FE-123, FE-124, FE-125 work (10,000 shows '10,000', picker, instant listing, cancel and buy).
- [x] **FE-35** Complaint entry point on every project page (opens the complaint form, FE-72). Done 2026-11-10 (WS-11.1-lean): ReportProblem button on `/projects/[id]` (sign-in hint when signed out); verified by code read, tsc 0, lint clean; runtime NOT verified.

## Phase 5: Gasless action UX

`[BLOCKED-BY]` contracts v2 (EIP-712 types) and the API relayer (API-72).

- [x] **FE-40** (2026-11-07, WS-08.3L; Vote and Permit domains/types/spender verified field by field against api relayService and the Solidity; no human-readable pre-popup summary beyond the wallet's own typed-data view; runtime NOT verified) Typed-data signing helpers (viem `signTypedData`) for the two actions that need a signature: `Vote` (EIP-712) and the ERC-2612 `Permit` used for staking: chain id, verifying contract, token nonce read from the chain, deadline; show a human-readable summary before the wallet popup. Claim tokens and execute milestone need no signature (one click, no wallet popup).
- [ ] **FE-41** Gas tracker widget (header and in action dialogs): current gas vs 24-hour average for the active chain from `GET /api/v1/gas/:chainId`, status chip (Normal / Busy).
- [ ] **FE-42** Busy-network handling: when status is Busy, warn that the action will be queued and sent when fees drop (maximum wait 6 hours, shorter when a vote closes soon); show the expected send-by time; allow "send now" only when the API marks it urgent.
- [ ] **FE-43** (history part done 2026-11-10 via FE-94 on /portfolio; rest unchanged) Request tracker: queue states (Queued → Sending → Confirmed / Failed / Expired) with polling, toast on completion, retry from a failed or expired state, history on the investor dashboard.
  - Partial 2026-11-07 (WS-08.3L): `useRelayRequest` polling (3 s, 3 min cap) + `RelayStatus` steps with tx link and 'Pay gas yourself' on failure. Remaining: toast, history page (`listRelayRequests` unused), retry button.
- [ ] **FE-93** (WS-08.3L follow-up) EXPIRED relay status is not a self-pay trigger (only RELAY_DISABLED, SELF_PAY, GAS_TOO_HIGH, RELAY_UNAVAILABLE, NETWORK_ERROR are); also add server codes RELAYER_LOW_BALANCE (503; should offer self-pay), USER_DAILY_LIMIT, CHAIN_DAILY_LIMIT, DEADLINE_TOO_FAR, INVALID_SIGNATURE, SIGNATURE_MISMATCH, INSUFFICIENT_BALANCE to `RELAY_ERROR_MESSAGES` (they currently show the server's own message) and treat RELAYER_LOW_BALANCE / daily limits as self-pay triggers.
- [x] **FE-94** (2026-11-10, WS-09.5-lean; code verified, runtime NOT verified; shown as a section on /portfolio) Relay history page using `listRelayRequests` (currently unused).
- [ ] **FE-95** Block-explorer links for contract addresses and relay tx per chain (relay tx link exists only inside RelayStatus).
- [ ] **FE-96** ERC-1271 smart-contract wallets are unsupported by the gasless stake (Permit is EOA-only in the token) and the api verifies signatures with `verifyTypedData` (EOA); show a clear 'use pay gas' hint for such wallets.
- [x] **FE-99** (2026-11-08, WS-08.5L; verified by code read vs indexer stats.ts gas-ledger route and MilestoneEscrow._bookGas ceiling; tsc 0, lint clean; runtime NOT verified) Gas ledger card on the project page (`components/GasLedger.tsx`): total sponsored, on-chain gasBudget/ceiling, 'Used X of ceiling Y' bar, sponsored actions table with action filter, Show more and explorer tx links, debt section. FE-58 (founder dashboard gas overflow) and FE-68 (admin ledgers) stay open.
- [x] **FE-100** (WS-08.5L follow-up; done 2026-11-08, WS-11.2b; code verified vs relayStatus.ts, runtime NOT verified) Relayer balance indicator on the UI: needs a small public API endpoint first (API-123). Shown as a status strip on the `/admin` Relay tab (per chain enabled, address, ok/low/empty badge, 30 s poll).
- [ ] **FE-101** (WS-08.5L follow-up) GasLedger: 'Show more' can show one extra empty page when the row count is an exact multiple of 20; use `limit+1` or the summary actionCount.
- [ ] **FE-102** (WS-08.5L follow-up) GasLedger: invalidate/refetch right after a relay request is confirmed (today only the 30 s poll refreshes it).
- [ ] **FE-103** (WS-08.5L follow-up) GasLedger: chain-read failures (gasBudget/netFunds/MAX_DEBT_BPS) hide the budget and ceiling silently; surface a small note.
- [ ] **FE-44** Clear gas labelling on every button ("Free — ForgeCapita pays gas" vs "You pay network fee ~$x") using the gas tracker estimate.
- [ ] **FE-45** Stake in one signature (permit) with clear copy; unstake remains a normal transaction.

## Phase 6: Founder application wizard & dashboards

### Application wizard (`/apply`, replaces direct deployment on `/projects/create`)
- [x] **FE-50** (LEAN, ticked per user direction 2026-11-06 WS-07.3l: single-page `/apply` form + status card, not the stepper) Stepper: 1 Profile (name, category, description, website, pitch deck upload, logo upload) → 2 Identity (KYC document upload, manual review status) → 3 Revenue Share Agreement ("I agree" with scrollable text, typed name, wallet signature; draft banner "not legal advice") → 4 Repository (choose GitHub or GitLab; show the provisioned link) → 5 Shadow wallet (request; shown publicly once approved) → 6 Review status (Pending / Changes requested with notes / Approved / Rejected) → 7 Deploy.
  - Done: `/apply` (name, summary, https website and pitch deck URLs, optional github/gitlab repo, contact; status card pending/approved/rejected, review note, KYC verified, re-apply after reject). Remaining of the full stepper: identity/KYC upload, agreement signing, repository choice, shadow wallet, uploads, deploy (WS-07.2l, WS-07.10).
- [ ] **FE-51** Gated deploy step: `launchProject` is disabled until eligibility endpoint (API-39) says the founder is cleared; deployment uses the approved metadata; after confirmation link the escrow address to the application.
- [ ] **FE-52** Drag-and-drop file upload component (image / PDF) with progress, size and type limits, preview; replaces the logo and pitch deck URL inputs.

- [ ] **FE-53** Minimum funding goal per chain: the application and deploy forms show and enforce a separate minimum for Arbitrum Sepolia (ETH) and BSC Testnet (BNB), with a short explanation that the 5% platform fee must cover the sponsored gas for about 100 investors and 5 milestones (contracts v2 design section 13). Values come from per-chain configuration (public, not secret) so they can be recalibrated without a code change.

### Investor dashboard (`/investor`)
- [ ] **FE-55** Portfolio overview (backed projects, token balances, staked amounts, yield claimed); open polls needing attention; claim yield; refunds; queued gasless request history.
  - Partial (2026-11-06, WS-09.4-lean): minimal `/portfolio` done (positions list from indexer `GET /investors/:address/positions`: invested net of refunds, refunded, staked, token balance, yield claimed, Navbar link). Runtime not verified.
  - Partial (2026-11-10, WS-09.5-lean; code verified, tsc 0, lint clean, USER-VERIFIED 2026-11-10 (user-reported: claimable yield matches, gasless requests listed, signed-out hint)): per-position claimable yield (on-chain `getClaimableYield`, Claim link) and 'Gasless requests' section done. Update 2026-11-10 (WS-09.5b): open-poll and refund badges done (FE-126, FE-127; code verified, USER-VERIFIED 2026-11-10 (user-reported: refund badge, vote badge, explorer links all 'works'; not verified by Claude)). Remaining: name join beyond first 100 projects (FE-128); FE-55 stays unticked until FE-128 is done.
- [x] **FE-126** (2026-11-10, WS-09.5b; code verified, tsc 0, lint clean, USER-VERIFIED 2026-11-10 (user-reported)) Portfolio: open polls needing attention ('Vote open until <date>' badge linking to milestones).
- [x] **FE-127** (2026-11-10, WS-09.5b; code verified, USER-VERIFIED 2026-11-10 (user-reported)) Portfolio: refunds list ('Refund available' badge linking to the project; refund tx stays in InvestorPanel).
- [ ] **FE-128** Portfolio: project name / distributor join beyond the first 100 projects (listProjects limit 100; positions beyond it show dash for claimable yield).
- [x] **FE-129** (2026-11-10, WS-09.5b; grep verified, tsc 0) Move `explorerTxUrl` from `components/admin/shared.tsx` into `lib/` (portfolio now imports it from the admin components).
- [x] **FE-130** (2026-11-10, WS-09.5c; code read + scratch run, tsc 0, lint clean, runtime NOT verified) Portfolio claimable yield uses `formatEth`, now bigint-safe (covered by FE-112).
- (API-83 investor endpoint: deferred / not needed, the lean portfolio uses indexer positions, on-chain reads and existing `GET /relay`.)

### Founder dashboard (`/founder`)
- [x] **FE-111** (2026-11-09, WS-12.1a; code verified vs RevenueRouter.sol, tsc 0, lint clean, runtime NOT verified) Developer-only 'Creator funds' card (`components/CreatorFunds.tsx`, project page): on-chain pending `creatorPendingFunds` (10 s), totals and claim history from the indexer, 'Claim creator funds' with ConfirmDialog (user pays gas). Note (user decision 2026-11-09): routePayment UI intentionally not exposed; revenue routing is the founder's payment process + WS-10 reconciliation.
- [x] **FE-116** (2026-11-09, WS-12.1b; code verified, tsc 0, lint clean, runtime NOT verified) Indexer lag note without minutes: `lib/useIndexerLag.ts` (polls indexer /status every 60 s, behind when newest block older than 120 s) and `components/IndexerLagNote.tsx`, used in CreatorFunds, GasLedger and /launches; post-tx messages say 'a little while'. Trigger: 'Total claimed' did not rise after a claim because the indexer was ~9 min behind.
- [ ] **FE-117** One shared query for indexer /status instead of per-instance polling (each IndexerLagNote polls separately).
- [ ] **FE-118** Use IndexerLagNote on other indexer-based screens (dashboard cards, portfolio, p2p lists).
- [ ] **FE-119** Optimistic update of 'Total claimed' from the on-chain claim receipt (show the claimed amount immediately until the indexer catches up).
- [ ] **IDX-59** (watch item, recurring indexer lag, now ~9 min; lives in the indexer repo, noted here for the user-facing note)
- [x] **FE-112** (2026-11-10, WS-09.5c; code read + scratch run of the copied function, tsc 0, lint clean, runtime NOT verified) `formatEth` in lib/api.ts rewritten with bigint-only arithmetic (half away from zero, decimals clamped 0-18, '-' on unparsable input); `formatNative` picks it up.
  - Remaining (minor): CreatorFunds still uses its own `fmtWei`; consolidate if wanted.
- [ ] **FE-113** Public revenue page (WS-10.6): totals and history for investors.
- [ ] **FE-114** Decide whether CreatorFunds should also show for former developers (history only); claim history pagination (currently latest 20).
- [x] **FE-120** (added and done 2026-11-09, WS-10.C; code read vs API DTOs, tsc 0, lint clean, runtime NOT verified) Staff `/admin` Compliance tab (`components/admin/ComplianceTab.tsx`): state and network filters, columns project/network/state/observed vs routed/shortfall/last checked/window and note, refresh, paging; lib/api.ts `listAdminCompliance`.
- [x] **FE-122** (added and done 2026-11-09, WS-10.D; code read, tsc 0, lint clean, browser NOT verified) Staff compliance actions in `ComplianceTab.tsx`: Resolve (WARNED/ESCALATED) and Shut down (ESCALATED) with ConfirmDialog and required note (max 500), 409 handling; `ConfirmDialog` optional `confirmDisabled`; SHUTDOWN shown as rose badge (TransparencyPanel, globals.css); `lib/api.ts` resolveComplianceCase / shutdownComplianceCase.
- [ ] **FE-121** (added 2026-11-09) Staff inflows view (per-project observed inflow records) in /admin, deferred from WS-10.C.
- [ ] **FE-115** (added 2026-11-09, open, optional) Founder-facing instructions panel: how to route revenue to the RevenueRouter (routePayment, never a plain transfer), router address with a copy button.
- [ ] **FE-58** (PARTIAL 2026-11-09: pending creator funds and claim done via FE-111; remaining: my projects list, round status, milestone progress, gas overflow, compliance explanation, shadow wallet, repo link, agreement status) My projects: round status, funds, milestone progress, gas ledger overflow, pending creator funds (`creatorPendingFunds` → `claimCreatorFunds()`), compliance state with plain-language explanation, shadow wallet and change request, repo link, agreement status.
- [ ] **FE-59** (PARTIAL 2026-11-09: public read of observed vs routed and shortfall in TransparencyPanel; remaining: founder revenue report with history, tolerance view per period, stablecoin guidance) Revenue report: on-chain deposits vs observed shadow-wallet inflow, tolerance, history; guidance for converting stablecoin revenue to ETH/BNB before depositing.
- [ ] **FE-60** Milestone panel: status, who can execute, frozen warning, gasless execute request status (founders may also trigger it).
  - PARTIAL (WS-12.0m 2026-11-07): `MilestonePanel` (visible to everyone) shows status, thresholds, frozen warning, execute rules. Remaining: gasless execute request status, 'of N'.

- [x] Per-chain currency labels (WS-08.3m 2026-11-07): `chainCurrency` (97 -> BNB, else ETH) used on cards, detail page, p2p, portfolio, create form (code verified, runtime NOT verified)
- [x] Developer 'Close funding & start' (minimal, WS-08.3m 2026-11-07): `components/DeveloperPanel.tsx`, on-chain preconditions, confirm dialog with 5% fee. First slice of the founder dashboard (WS-12); developer FE for startMilestone / vote open, execute, claim funds still open (see FE-58, FE-60).
- [ ] Developer-only view for `startMilestone(index)` (exists in contract, developer only, needs funding closed, not cancelled, previous milestone executed), execute and claim creator funds: not implemented (FE-60/FE-58)
  - PARTIAL (WS-12.0m 2026-11-07): start milestone vote (developer) and execute milestone (anyone) done in `components/MilestonePanel.tsx`, code verified vs MilestoneEscrow.sol, runtime NOT verified. Remaining: claim creator funds (WS-12.1 / API-82).
- [x] Milestones page reads chain state (WS-12.0n 2026-11-08): milestones, votingEndTime, hasVoted, projectCancelled, developer via `useReadContracts` (10 s refetch); indexer only as loading fallback; invalidates after vote (code verified vs MilestoneEscrow._vote, runtime NOT verified)
- [x] Execute milestone is developer-only in `MilestonePanel` (WS-12.0n 2026-11-08); investors see 'Approved: waiting for the developer to execute this milestone.'; exception: 'Finalise failed vote' stays available to any wallet (investors need it to cancel and open refunds)
- [x] Vote display scaled to the public supply (WS-12.0p 2026-11-08): Yes/No as % of public supply, stacked bar with Quorum 20% and Fast track 50% markers, turnout, 'Fast track: N more Yes needed' / 'Fast track reached'; same numbers in `MilestonePanel`; `pctOfSupply`/`barWidthPct` in `lib/format.ts` (code verified vs MilestoneEscrow.executeMilestone, runtime NOT verified)
- [ ] Stacked vote bar clips No if yes+no > public supply (cannot happen on chain; cosmetic)
- [ ] Show the connected wallet's voting weight (staked balance): 'Your voting weight: X, Y% of public supply'
- [ ] Hint for investors who have not staked: 'Stake your tokens to vote' (weight = staked balance)
- [ ] Milestones page empty-state text still says 'indexed by Ponder'; reword (chain reads are the source now)
- [ ] Developer who never executes an approved milestone blocks payout/progress: WS-08.4L auto-execute worker (relayer) will cover; consider letting anyone execute after N days of approval
- [ ] Failed-vote finalisation by investors is possible only after the 28-day voting period ends
- [ ] Milestone panel shows 'Milestone N of M' (needs milestone count in ProjectDto or a milestones list)
- [ ] Developer `cancelProject` action in the panel
- [ ] Guardian freeze UI (not planned)
- [ ] Gasless / automatic milestone execute request (WS-08.4L)
- [ ] Confirm on testnet that a failed-vote finalisation is only possible after 28 days (VOTING_PERIOD constant; smoke tests used >50% staked yes fast-track)
- [ ] Stake section does not hide when the user has no tokens
- [ ] Project list cards are still indexer-based (lag); consider a lag banner like /launches
- [ ] On-chain freshness for state after close: the detail page may show FUNDING until the indexer catches up (only RAISED is live; 'Updating from the chain' note)

### Staff dashboard (`/staff`)
- [ ] **FE-65** (partial; 2026-11-08 WS-11.2b added read-only Audit log, Launch drafts and Relay tabs; Risk Center, complaints, takeover prep remain) Applications queue (approve / request changes / reject), KYC review (secure document viewer), repo provisioning status, shadow wallet change approvals, complaints queue and thread, read-only Risk Center, takeover case preparation and signalling vote setup.
  - Partial (2026-11-06, WS-07.4l, FIRST PART ticked per user direction): `/admin` applications queue (tabs, paging 20, detail, approve with KYC checkbox, reject with required note) and admin-only Users role management done. Second part done 2026-11-06 (WS-07.5l): `/admin` shadow wallet approvals queue. Remaining: request-changes, KYC document viewer, repo provisioning, complaints, Risk Center, takeover prep.

- [ ] Extract duplicated `SafeLink` and `Row` helpers from `app/apply/page.tsx` and `app/admin/page.tsx` into a shared component
- [ ] Decide whether staff may see the Users list (API allows staff to list; UI shows Users to admin only)
- [x] Gate `/projects/create` on approved founder status (WS-07.5l 2026-11-06: founders gated on `GET /founders/me/launch-eligibility`, checklist + disabled launch, selector of approved unbound wallets, `shadowWalletId` sent in the profile POST; code verified, runtime NOT verified; fixes in code the profile-save break left by WS-07.5a)
- [x] `/founder` page (WS-07.5l 2026-11-06, code verified, runtime NOT verified): 3 eligibility checks, agreement text + typed name + wallet signature (message built from `messageTemplate`, checksummed wallet, trimmed name, ISO issuedAt; matches api `buildAgreementMessage`/`acceptAgreement`), shadow wallet pool list and request form (one pending at a time), Navbar Founder link for role founder. Related: FE-50 agreement and shadow wallet steps, FE-58 partial (agreement status, shadow wallet; projects/funds/etc. remain).
- [x] `/admin` Shadow wallets queue (WS-07.5l 2026-11-06, FE-65 second part; tabs, paging 20, approve with optional note, reject with required note; code verified, runtime NOT verified)
- [ ] `describeApiError` masks 403/404 server messages on older pages (`/apply`, `/admin`) while `describeFounderError` keeps them for 400/403/409; unify.
- [ ] `SafeLink`/`Row` duplication still open (now also relevant to new pages).
- [ ] FE-26a settle uses a fixed 1500 ms timer (heuristic); replace with a wagmi-based reconnect signal if it misbehaves.
- [x] Replace `window.confirm` role-change confirmation in `/admin` with a proper confirm modal (WS-08.3n 2026-11-07: `components/ConfirmDialog.tsx`, also used for close funding in DeveloperPanel and cancel launch in /launches; no `confirm(` left; code verified, runtime NOT verified)
- [x] Fund card gating on the project page (WS-08.3n 2026-11-07): `FundingGate` hides the card for the developer, shows 'Funding is closed for this project.' when state is not FUNDING / fundingClosedAt set / on-chain isFundingActive false, and 'The funding window has ended.' after the on-chain deadline; matches MilestoneEscrow.receive() (code verified, runtime NOT verified)
- [ ] ConfirmDialog is untested at runtime (focus return, Escape, Tab trap)
- [ ] ConfirmDialog focus return fails silently if the trigger is disabled or unmounted when the dialog closes (e.g. after a successful close funding)
- [ ] Shadow wallet approve/reject in /admin has no confirm dialog (none existed before); decide if one is wanted

### Admin dashboard (`/admin`)
- [ ] **FE-68** (partial; 2026-11-08 WS-11.2b read-only audit log viewer, drafts and relay ledgers tabs done; rest open) Everything in staff plus: compliance cases (WARNED / ESCALATED) with evidence, **freeze / unfreeze milestones** and **emergency shutdown** (signed by the admin's connected treasury wallet; confirmation dialog that states the consequences), takeover execution (`proposeNewDeveloper`) and repo lockout, relayer health (balance, spend, queue, circuit breaker), project gas ledgers, staff management, system settings (tolerance, token allow-list, relayer limits), audit log viewer, analytics.
- [ ] **FE-69** Rogue contract alerts (launches without approved applications) with one-click case creation.

### Investor protection features
- [ ] **FE-72** Complaint form and "my complaints" page with thread and status.
  - PARTIAL 2026-11-10 (WS-11.1-lean; code read, tsc 0, lint clean, runtime NOT verified): ComplaintDialog form, My complaints list on `/portfolio` (status badges), staff Complaints tab in `/admin` (filter, paging, detail, status change with note). Remaining: thread, a dedicated "my complaints" page.
  - 2026-11-10 follow-up: reporter sees the staff note in My complaints; staff tab labelled 'Note shown to reporter'; code read, tsc 0, lint clean; runtime NOT verified.
- [ ] **FE-72a** Complaints: message thread (needs API-60b).
- [ ] **FE-72b** Complaints: evidence upload (needs API-60c).
- [ ] **FE-72c** Complaints: ESCALATED status and assignee in the staff tab (needs API-60a).
- [ ] **FE-72d** Complaints: Risk Center link (needs API-61) and reporter list paging beyond 100 (needs API-60g).
- [ ] **FE-73** Takeover signalling vote page (staked-balance snapshot, weight, deadline, result).
- [ ] **FE-74** Notification centre (in-app) matching email notifications.

## Phase 7: Quality

- [ ] **FE-80** Responsive review at 375 / 768 / 1280 widths for every page; touch-target and keyboard-accessibility audit; reduced-motion support.
- [ ] **FE-81** Unit tests for typed-data builders, gas-status logic and form schemas (vitest).
- [ ] **FE-82** Playwright end-to-end tests: sign up → link wallet → apply → (staff approves via test fixtures) → deploy; invest → claim → stake → vote on a local or testnet fixture; gasless request lifecycle with mocked relayer.
- [ ] **FE-83** Lighthouse / bundle size budget; image optimisation; lazy load heavy widgets.
- [ ] **FE-84** Refresh `frontend-instructions.md` (it still references Sepolia and old function names).
- [x] **FE-97** Fix React style warning (shorthand `margin` mixed with longhand `marginBottom`) in `components/MilestonePanel.tsx`: `MUTED` now uses longhand margins (2026-11-08).
- [ ] **FE-98** Audit other components for margin/padding shorthand + longhand mixes (a grep of app/ and components/ found no other occurrence on 2026-11-08); optional lint rule.
- [x] **FE-85 `[USER-ACTION]`** GitHub Actions CI (lint, typecheck, build, tests). (workflow file `.github/workflows/ci.yml` written 2026-11-08 WS-13.1: npm ci, tsc, lint, build with placeholder NEXT_PUBLIC_*; no tests step; read by tracker, NOT run; user must commit and push to enable)
- [x] **FE-104** (added 2026-11-08; user-reported GREEN 2026-11-08 after the lockfile regeneration, not verified by Claude) Run the frontend CI once on GitHub and adjust the NEXT_PUBLIC_* placeholders if the build fails.
  - 2026-11-08: first run failed at `npm ci` (package.json and package-lock.json not in sync: stale lockfile, missing transitive @x402/*, @solana/kit 8.x vs 5.5.1, siwe, etc.). Fixed locally by regenerating package-lock.json (package.json untouched); `npm ci --dry-run`, tsc, lint and build verified in a clean temp copy per main session (not re-run by tracker). Still to do: user commits the lock, pushes and confirms the Actions run is green.
- [ ] **FE-105** (added 2026-11-08) Add a CI guard so the lockfile cannot drift (e.g. pre-commit `npm ci --dry-run`, or an early CI step that fails with a clear message).
- [ ] **FE-106** (added 2026-11-08) Pin the npm version in the Docker image (container npm 10.9.9 vs CI Node 22) so local and CI lockfile resolution match.
- [ ] **FE-107** (added 2026-11-08) Review the new transitive @x402/* and @solana/* packages (from wallet connector peer/optional deps): confirm they are unused/tree-shaken and check bundle size.
- [ ] **FE-108** (added 2026-11-08) Note: `use-sync-external-store` peer warning with React 19 (valtio 1.13.2 via WalletConnect) is a warning only; revisit when WalletConnect updates.
