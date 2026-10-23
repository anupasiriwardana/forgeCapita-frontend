# ForgeCapita Frontend Specification: Phase 1 (Core Pages + P2P)

## 1. Project Context & Architecture
ForgeCapita is a Web3 milestone-gated crowdfunding and SaaS equity platform operating on the Ethereum Sepolia Testnet. 
The frontend is a Next.js (App Router) application that acts as the primary user interface for founders (to launch projects) and investors (to fund projects, vote on milestones, and trade tokens).

**The dual-data architecture:**
1. **On-Chain Data (Ponder Indexer):** Running locally at `http://localhost:42069`. It provides a GraphQL API for blockchain events (total ETH raised, milestone states, yes/no votes, P2P listings).
2. **Off-Chain Data (Express API):** Running locally at `http://localhost:3001`. It provides a REST API (`/api/projects`) for Web2 metadata (startup name, description, logo URLs, pitch decks). The GET endpoints execute a SQL `JOIN` to return both off-chain metadata and Ponder's on-chain data in a unified JSON object.

## 2. Technology Stack
* **Framework:** Next.js (App Router) with TypeScript and Tailwind CSS.
* **Web3 Integration:** Wagmi, Viem, and RainbowKit.
* **Data Fetching:** Standard `fetch` API for REST (Express), and `graphql-request` (or Apollo/urql) for querying Ponder.

## 3. Directory Architecture
Generate the frontend following this exact structure at the project root:

```text
forgecapita-frontend/
├── app/
│   ├── layout.tsx                  # Global layout containing the RainbowKit Provider & Navbar
│   ├── page.tsx                    # Marketplace Dashboard (View all projects)
│   ├── p2p/
│   │   └── page.tsx                # P2P Secondary Market for token trading
│   └── projects/
│       ├── create/
│       │   └── page.tsx            # Form to launch a new startup
│       └── [id]/
│           ├── page.tsx            # Project detail & Funding page
│           └── milestones/
│               └── page.tsx        # Governance & Voting page
├── components/
│   ├── Navbar.tsx                  # Contains the RainbowKit <ConnectButton/>
│   ├── ProjectCard.tsx             # UI component for the dashboard
│   ├── P2PListingCard.tsx          # UI component for secondary market listings
│   └── web3/
│       └── Providers.tsx           # WagmiConfig, QueryClient, and RainbowKitProvider wrapper
├── config/
│   ├── wagmi.ts                    # Wagmi config (Sepolia network, RPC setup)
│   └── abis/                       # Smart contract JSON ABIs
├── lib/
│   └── api.ts                      # Helper functions to fetch from Express and Ponder
├── .env.local                          
├── tailwind.config.ts
├── Dockerfile                      # Next.js Docker configuration
└── package.json

```

## 4. Core Pages & Feature Requirements

### A. Global Layout & Providers (`app/layout.tsx` & `Navbar.tsx`)

* **Requirement:** Wrap the application in a `Providers.tsx` component that initializes Wagmi and RainbowKit for the Sepolia testnet.
* **Navbar:** Must include navigation links (Dashboard, P2P Market) and the RainbowKit `<ConnectButton />`.

### B. Marketplace Dashboard (`app/page.tsx`)

* **Role:** The landing page displaying all active projects.
* **Data Source:** Call `GET http://localhost:3001/api/projects` (Express API).
* **UI:** Render a grid of `ProjectCard` components showing the startup metadata and `total_funded`. Clicking a card navigates to `/projects/[id]`.

### C. Launch Project Page (`app/projects/create/page.tsx`)

* **Workflow:**
1. User fills out off-chain data (Name, Description, Logo URL).
2. User inputs on-chain data (Funding Goal in ETH).
3. **Web3 Action:** Use Wagmi's `useWriteContract` to call `createProject` on the `ForgeCapitaFactory` contract.
4. **Web2 Action:** Upon transaction success, send a `POST` request to `http://localhost:3001/api/projects/profile` with the extracted Escrow address and off-chain data.



### D. Project Detail & Funding Page (`app/projects/[id]/page.tsx`)

* **Data Source:** Call `GET http://localhost:3001/api/projects/[id]`.
* **Workflow:**
* Display metadata and a "Fund Project" input field (amount in ETH).
* **Web3 Action:** Use `useWriteContract` to call `deposit()` on the specific `MilestoneEscrow` contract address (`[id]`) sending the specified `value` in ETH.



### E. Milestones & Governance (`app/projects/[id]/milestones/page.tsx`)

* **Data Source:** Query the Ponder GraphQL API directly for the `milestones` associated with this `projectId`.
* **Workflow:**
* List milestones and their voting statuses.
* **Web3 Action:** Call `vote(milestoneIndex, support)` on the `MilestoneEscrow` contract via "Vote Yes/No" buttons.



### F. P2P Secondary Market (`app/p2p/page.tsx`)

* **Role:** Allows investors to buy and sell their staked project tokens.
* **Data Source:** Query the Ponder GraphQL API for active listings (`p2pListings(where: { isActive: true })`).
* **Workflow:**
* Render a grid of `P2PListingCard` components.
* **Web3 Action (Buy):** "Buy" button calls `fillListing(listingId)` on the `P2PExchange` contract, sending the required ETH value.
* **Web3 Action (Sell):** A "Create Listing" modal calls `createListing(token, amount, price)` on the `P2PExchange` contract.



## 5. Security & Best Practices

* Never hardcode API URLs or Contract Addresses. Utilize `.env.local` strictly.
* Handle Web3 transaction states (Pending, Success, Error) gracefully in the UI using Wagmi's `useWaitForTransactionReceipt`.
