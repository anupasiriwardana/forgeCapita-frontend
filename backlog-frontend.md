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

- [ ] **FE-10** Update `config/wagmi.ts` from Ethereum Sepolia to **Arbitrum Sepolia (421614)** and **BSC Testnet (97)**; per-chain transports and per-chain contract address map; remove `sepolia`.
- [ ] **FE-11** Chain switcher / indicator in the shell; wrong-network prompt with one-tap switch.
- [ ] **FE-12 `[USER-ACTION]`** WalletConnect Project ID (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`), dedicated RPC URLs per chain, and contract addresses per chain (v2 addresses after CON-04.2).
- [ ] **FE-13** Sync v2 ABIs with `node .claude/scripts/sync-abi.js frontend <Contract>`; typed contract hooks per chain. `[BLOCKED-BY]` contracts v2.
- [ ] **FE-14** Transaction toast system (submitting → pending → confirmed → failed) with explorer links; sticky transaction bar on mobile.

## Phase 3: Accounts & roles

- [ ] **FE-20** Sign up, log in, log out, email verification result, forgot / reset password pages; generic error messages; password strength meter.
- [ ] **FE-21** Account and security page: change password, TOTP enrolment (QR + recovery codes), active sessions, linked wallet.
- [ ] **FE-22** Link-wallet flow: connect → request nonce → sign message → confirm; show the linked address and warn when the connected wallet differs from the linked one.
- [ ] **FE-23** Route guards and role-aware redirects (server-side check in middleware / layouts); "forbidden" and "2FA required" screens for staff and admin.
- [ ] **FE-24** Authenticated API client: cookie credentials, CSRF header, automatic 401 handling.

## Phase 4: Marketplace & project pages

- [ ] **FE-30** Marketplace filters: category, chain, status, search; sorting; pagination; skeleton loading; mobile filter sheet.
- [ ] **FE-31** Project detail redesign: funding progress, milestones timeline, team, repo link, contract addresses (with explorer links), **Transparency panel** (approved shadow wallet shown permanently, compliance state, last reconciliation, deposits vs observed, freeze flag).
- [ ] **FE-32** Investor actions on the project page: invest (user-paid), **claim tokens (gasless)**, stake / unstake, claim yield, refund buttons (`refundFailedCrowdfund`, `refundDeadProject`) with state checks and clear "you pay gas" / "free" labels.
- [ ] **FE-33** Voting UI (gasless): show staked voting power (`DividendDistributor.stakedBalance`), vote-lock warning (`isUserVoteLocked`), vote progress vs quorum, time remaining, queued state.
- [ ] **FE-34** P2P additions: token approval step before listing, cancel listing, trade history, fee display.
- [ ] **FE-35** Complaint entry point on every project page (opens the complaint form, FE-72).

## Phase 5: Gasless action UX

`[BLOCKED-BY]` contracts v2 (EIP-712 types) and the API relayer (API-72).

- [ ] **FE-40** Typed-data signing helpers (viem `signTypedData`) for the two actions that need a signature: `Vote` (EIP-712) and the ERC-2612 `Permit` used for staking: chain id, verifying contract, token nonce read from the chain, deadline; show a human-readable summary before the wallet popup. Claim tokens and execute milestone need no signature (one click, no wallet popup).
- [ ] **FE-41** Gas tracker widget (header and in action dialogs): current gas vs 24-hour average for the active chain from `GET /api/v1/gas/:chainId`, status chip (Normal / Busy).
- [ ] **FE-42** Busy-network handling: when status is Busy, warn that the action will be queued and sent when fees drop (maximum wait 6 hours, shorter when a vote closes soon); show the expected send-by time; allow "send now" only when the API marks it urgent.
- [ ] **FE-43** Request tracker: queue states (Queued → Sending → Confirmed / Failed / Expired) with polling, toast on completion, retry from a failed or expired state, history on the investor dashboard.
- [ ] **FE-44** Clear gas labelling on every button ("Free — ForgeCapita pays gas" vs "You pay network fee ~$x") using the gas tracker estimate.
- [ ] **FE-45** Stake in one signature (permit) with clear copy; unstake remains a normal transaction.

## Phase 6: Founder application wizard & dashboards

### Application wizard (`/apply`, replaces direct deployment on `/projects/create`)
- [ ] **FE-50** Stepper: 1 Profile (name, category, description, website, pitch deck upload, logo upload) → 2 Identity (KYC document upload, manual review status) → 3 Revenue Share Agreement ("I agree" with scrollable text, typed name, wallet signature; draft banner "not legal advice") → 4 Repository (choose GitHub or GitLab; show the provisioned link) → 5 Shadow wallet (request; shown publicly once approved) → 6 Review status (Pending / Changes requested with notes / Approved / Rejected) → 7 Deploy.
- [ ] **FE-51** Gated deploy step: `launchProject` is disabled until eligibility endpoint (API-39) says the founder is cleared; deployment uses the approved metadata; after confirmation link the escrow address to the application.
- [ ] **FE-52** Drag-and-drop file upload component (image / PDF) with progress, size and type limits, preview; replaces the logo and pitch deck URL inputs.

- [ ] **FE-53** Minimum funding goal per chain: the application and deploy forms show and enforce a separate minimum for Arbitrum Sepolia (ETH) and BSC Testnet (BNB), with a short explanation that the 5% platform fee must cover the sponsored gas for about 100 investors and 5 milestones (contracts v2 design section 13). Values come from per-chain configuration (public, not secret) so they can be recalibrated without a code change.

### Investor dashboard (`/investor`)
- [ ] **FE-55** Portfolio overview (backed projects, token balances, staked amounts, yield claimed); open polls needing attention; claim yield; refunds; queued gasless request history.

### Founder dashboard (`/founder`)
- [ ] **FE-58** My projects: round status, funds, milestone progress, gas ledger overflow, pending creator funds (`creatorPendingFunds` → `claimCreatorFunds()`), compliance state with plain-language explanation, shadow wallet and change request, repo link, agreement status.
- [ ] **FE-59** Revenue report: on-chain deposits vs observed shadow-wallet inflow, tolerance, history; guidance for converting stablecoin revenue to ETH/BNB before depositing.
- [ ] **FE-60** Milestone panel: status, who can execute, frozen warning, gasless execute request status (founders may also trigger it).

### Staff dashboard (`/staff`)
- [ ] **FE-65** Applications queue (approve / request changes / reject), KYC review (secure document viewer), repo provisioning status, shadow wallet change approvals, complaints queue and thread, read-only Risk Center, takeover case preparation and signalling vote setup.

### Admin dashboard (`/admin`)
- [ ] **FE-68** Everything in staff plus: compliance cases (WARNED / ESCALATED) with evidence, **freeze / unfreeze milestones** and **emergency shutdown** (signed by the admin's connected treasury wallet; confirmation dialog that states the consequences), takeover execution (`proposeNewDeveloper`) and repo lockout, relayer health (balance, spend, queue, circuit breaker), project gas ledgers, staff management, system settings (tolerance, token allow-list, relayer limits), audit log viewer, analytics.
- [ ] **FE-69** Rogue contract alerts (launches without approved applications) with one-click case creation.

### Investor protection features
- [ ] **FE-72** Complaint form and "my complaints" page with thread and status.
- [ ] **FE-73** Takeover signalling vote page (staked-balance snapshot, weight, deadline, result).
- [ ] **FE-74** Notification centre (in-app) matching email notifications.

## Phase 7: Quality

- [ ] **FE-80** Responsive review at 375 / 768 / 1280 widths for every page; touch-target and keyboard-accessibility audit; reduced-motion support.
- [ ] **FE-81** Unit tests for typed-data builders, gas-status logic and form schemas (vitest).
- [ ] **FE-82** Playwright end-to-end tests: sign up → link wallet → apply → (staff approves via test fixtures) → deploy; invest → claim → stake → vote on a local or testnet fixture; gasless request lifecycle with mocked relayer.
- [ ] **FE-83** Lighthouse / bundle size budget; image optimisation; lazy load heavy widgets.
- [ ] **FE-84** Refresh `frontend-instructions.md` (it still references Sepolia and old function names).
- [ ] **FE-85 `[USER-ACTION]`** GitHub Actions CI (lint, typecheck, build, tests).
