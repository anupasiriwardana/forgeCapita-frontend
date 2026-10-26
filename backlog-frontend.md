# ForgeCapita Frontend — Development Backlog

This backlog tracks the client-side Next.js web application (`forgecapita-frontend`), responsible for founder project launches, investor crowdfunding, milestone voting, secondary P2P equity trading, and role-based dashboards (Admin, Founder, Investor).

> **Legend:**
> - `[x]` Completed
> - `[ ]` Pending
> - `[USER-ACTION]` Requires manual action or credential provisioning from the repository owner/user.

---

## Phase 1: Core Pages & Web3 Infrastructure

### Core Framework & Styling
- [x] Initialize Next.js 16 (App Router) project with TypeScript and Tailwind CSS.
- [x] Implement modern dark-mode aesthetic with custom glassmorphism design system in `globals.css`.
- [x] Configure RainbowKit, Wagmi, and React Query client providers in `components/web3/Providers.tsx`.
- [x] Create navigation bar (`components/Navbar.tsx`) with brand logo, route links, and `<ConnectButton />`.

### Multi-Chain Web3 Configuration
- [ ] **Critical Fix:** Update `config/wagmi.ts` to support **Arbitrum Sepolia** (Chain ID `421614`) and **BSC Testnet** (Chain ID `97`) instead of Ethereum Sepolia (`sepolia`).
- [ ] Add network switching pill or chain indicator in `Navbar.tsx` so users can switch seamlessly between Arbitrum Sepolia and BSC Testnet.
- [ ] `[USER-ACTION]` Register for a free WalletConnect Project ID at https://cloud.walletconnect.com and set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `.env.local`.
- [ ] `[USER-ACTION]` Verify and update contract addresses in `.env.local` for Arbitrum Sepolia (`NEXT_PUBLIC_FACTORY_ADDRESS`, `NEXT_PUBLIC_P2P_ADDRESS`) and BSC Testnet.
- [ ] `[USER-ACTION]` Provide dedicated testnet RPC endpoints in `.env.local` (e.g. Alchemy, QuickNode, or NodeReal) to prevent public RPC rate-limiting in user browsers.

### Marketplace & Project Discovery
- [x] Build Marketplace Dashboard (`app/page.tsx`) to display active startups.
- [x] Create reusable `ProjectCard.tsx` component with funding progress, status badges, and startup metadata.
- [x] Implement API helper `lib/api.ts` to fetch unified project listings from Express REST API (`GET /api/projects`).
- [ ] Add category filters, search input, and chain filter (Arbitrum / BSC) to the marketplace dashboard.

### Crowdfunding & Project Detail Page
- [x] Build Project Detail view (`app/projects/[id]/page.tsx`) with funding stats, founder bio, contract details, and progress bar.
- [x] Implement Funding Panel allowing backers to deposit ETH directly into `MilestoneEscrow`.
- [ ] Add Backer Token Claiming panel (`claimTokens()`) on `/projects/[id]` once the crowdfunding round is successfully closed.
- [ ] Add Founder Funding Closure button (`closeFundingAndStart()`) when `fundingGoal` is reached or deadline has passed.
- [ ] Add Refund Claim buttons for backers when campaigns fail (`refundFailedCrowdfund()`) or deadlock (`refundDeadProject()`).

### Milestone Governance & Voting Page
- [x] Build Milestone Governance page (`app/projects/[id]/milestones/page.tsx`).
- [x] Query Ponder GraphQL endpoint for project milestones and voting progress (`milestone` table).
- [x] Implement on-chain voting interface calling `vote(support)` on `MilestoneEscrow`.
- [ ] Display staked voting power by querying `DividendDistributor.stakedBalance(user)`.
- [ ] Add warning notification when tokens are vote-locked (`isUserVoteLocked()`).

### Secondary Market (P2P Exchange)
- [x] Build P2P Exchange page (`app/p2p/page.tsx`) querying active listings from Ponder GraphQL (`p2pListing` table).
- [x] Implement `P2PListingCard.tsx` with fill/buy interaction calling `P2PExchange.fillListing(listingId)`.
- [x] Implement "Create Listing" modal calling `P2PExchange.createListing(token, amount, price)`.
- [ ] Add token approval step (`ProjectToken.approve(p2pExchangeAddress, amount)`) prior to creating a P2P listing.
- [ ] Add "Cancel Listing" action for sellers on their active listings.

---

## Phase 2: Pre-Launch UI Gating & Dedicated Dashboards

### Pre-Launch UI Gating Workflow (`/projects/create`)
- [ ] Refactor `app/projects/create/page.tsx` from immediate on-chain deployment to a 2-step gated workflow:
  - **Step 1 (Application):** Founder submits off-chain startup metadata (name, description, pitch deck, website) to Express API (`POST /api/projects/apply`) with status set to `'PENDING'`.
  - **Step 2 (UI Gating):** Frontend checks founder application status. The "Deploy On-Chain" button remains disabled until status is `'APPROVED'`.
  - **Step 3 (Deployment):** Once approved, the founder executes `launchProject()` on the Factory contract and links the deployed Escrow address.
- [ ] Replace text input for `logoUrl` with a drag-and-drop file upload component sending image files via `multipart/form-data` to the backend.

### Admin Dashboard (`app/admin/page.tsx`)
- [ ] Build Admin review queue for `'PENDING'` startup applications with Approve / Reject action buttons.
- [ ] Build Rogue Contract Alert interface: Display any contracts indexed by Ponder that bypassed the UI application workflow.
- [ ] Implement one-click "Trigger Emergency Shutdown" button calling `emergencyShutdown()` for Treasury admin wallets.
- [ ] Build Founder KYC verification interface to toggle `kyc_verified` status.
- [ ] Build Hostile Takeover management UI to initiate `proposeNewDeveloper()` when founders abandon projects.

### Founder Dashboard (`app/founder/page.tsx`)
- [ ] Build overview panel displaying founder's active projects, raised funds, and round status.
- [ ] Build Milestone Execution panel: Fetches excess gas debt and cryptographic signature from `/api/paymaster`, then calls `MilestoneEscrow.executeMilestone(gasDebt, signature)`.
- [ ] Build Shadow Wallet Registration interface: Allows KYC-verified founders to input and update their fiat-to-crypto settlement wallet.
- [ ] Build SaaS Revenue Settlement panel: Query pending creator funds in `RevenueRouter` (`creatorPendingFunds`) and trigger `claimCreatorFunds()`.
- [ ] Display Secret Shopper audit status and any flagged transaction discrepancies.

### Investor Dashboard (`app/investor/page.tsx`)
- [ ] Build Portfolio Overview displaying backed projects, held `ProjectToken` balances, and staked positions.
- [ ] Build Staking & Dividend Management panel:
  - Approve `ProjectToken` for `DividendDistributor`.
  - Stake tokens into `DividendDistributor` (`stake(amount)`).
  - Unstake tokens (`withdraw(amount)`) with vote-lock check.
  - Real-time yield claiming (`claimYield()`) displaying accrued ETH dividends.
- [ ] Build Voting Power & Active Polls summary showing all open milestones across backed startups requiring investor attention.

---

## Phase 3: UX Polish & Security

- [ ] Implement Sign-In with Ethereum (SIWE) popup modal for authenticated dashboard actions.
- [ ] Add global transaction toast notification system (submitting, pending confirmation, confirmed, failed).
- [ ] Ensure all input forms feature comprehensive client-side schema validation (Zod).
- [ ] Implement mobile-responsive adaptations for tables, modal overlays, and stats cards.
- [ ] Write end-to-end integration tests (Playwright or Cypress) for the complete funding and voting flows.
