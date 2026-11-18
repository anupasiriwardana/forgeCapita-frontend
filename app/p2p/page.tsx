"use client";

import { useState, Suspense } from "react";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWriteContract, useAccount, useChainId, useConfig, usePublicClient } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ArrowLeftRight, Coins, Inbox, Network, Plus, ShoppingCart } from "lucide-react";
import { isAddress, parseEther, parseUnits, parseEventLogs, formatUnits, type PublicClient, type TransactionReceipt } from "viem";
import { fetchActiveListings, fetchRecentTrades, formatEth, shortAddr, type P2PListing, type P2PTrade } from "@/lib/api";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { StatCard } from "@/components/ui/StatCard";
import { toast } from "@/lib/toast";
import { isUserRejection, toastTxError, txErrorMessage, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
import { explorerAddressUrl } from "@/lib/explorer";
import { formatTokenAmount } from "@/lib/format";
import { TokenPicker } from "@/components/TokenPicker";
import { P2PListingCard, PROTOCOL_FEE_BPS, splitPrice } from "@/components/P2PListingCard";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { explorerTxUrl } from "@/lib/explorer";
import { ABIS, getContractConfig } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { chainCurrency, chainName, SUPPORTED_CHAINS } from "@/config/chains";

/** How long an optimistic entry may outlive the indexer before it is dropped. */
const OPTIMISTIC_TTL_MS = 10 * 60 * 1000;
const OPTIMISTIC_REFETCH_MS = 5000;
const WEI_PER_TOKEN = BigInt(10) ** BigInt(18);

type ChainFilter = "all" | `${number}`;

/** Price in wei for one whole token (18 decimals), bigint math only; 0 when the amount is 0. */
function pricePerToken(listing: P2PListing): bigint {
  const amount = BigInt(listing.tokenAmount);
  return amount > BigInt(0) ? (BigInt(listing.priceInETH) * WEI_PER_TOKEN) / amount : BigInt(0);
}

/** Live field check for a decimal input parsed to wei; null when empty or valid and above zero. */
function decimalFieldError(input: string, parse: (value: string) => bigint): string | null {
  if (input.trim() === "") return null;
  try {
    return parse(input.trim()) > BigInt(0) ? null : "Must be greater than zero.";
  } catch {
    return "Enter a valid number.";
  }
}

type P2PConfig = NonNullable<ReturnType<typeof getContractConfig<"p2pExchange">>>;

/**
 * Reads the created listing back from the chain (receipt log + listings()) and hands it to the
 * optimistic list. Best effort: on failure the indexer refetch still shows the listing later.
 */
async function publishCreated(
  logs: TransactionReceipt["logs"],
  p2p: P2PConfig,
  client: PublicClient,
  chainId: number,
  onCreated: (listing: P2PListing) => void,
): Promise<void> {
  try {
    const created = parseEventLogs({ abi: p2p.abi, logs, eventName: "ListingCreated" }).find(
      (l) => l.address.toLowerCase() === p2p.address.toLowerCase(),
    );
    if (!created) return;
    const listingId = created.args.listingId;
    const [seller, tokenAddress, tokenAmount, priceInETH, active] = await client.readContract({
      address: p2p.address,
      abi: p2p.abi,
      functionName: "listings",
      args: [listingId],
    });
    if (!active) return;
    onCreated({
      id: `${chainId}:${listingId.toString()}`,
      chainId,
      seller,
      tokenAddress,
      tokenAmount: tokenAmount.toString(),
      priceInETH: priceInETH.toString(),
      status: "ACTIVE",
    });
  } catch {
    // Read-back is an optimisation only; the indexer remains the source of truth.
  }
}

// ── Create Listing Modal ───────────────────────────────────────────────────

function CreateListingModal({
  onClose,
  onSuccess,
  onCreated,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onCreated: (listing: P2PListing) => void;
}) {
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [manualToken, setManualToken] = useState(false);
  const [tokenAmount, setTokenAmount] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState("");

  const chainId = useChainId();
  const { address } = useAccount();
  const config = useConfig();
  const publicClient = usePublicClient();
  const [step, setStep] = useState("");
  const { writeContractAsync } = useWriteContract();

  let receiveText = "";
  try {
    const typed = parseEther(priceEth);
    if (typed > BigInt(0)) receiveText = `${formatEth(splitPrice(typed).proceeds.toString(), 6)} ${chainCurrency(chainId)}`;
  } catch {
    receiveText = "";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const p2p = getContractConfig(chainId, "p2pExchange");
    if (!p2p) {
      setTxStatus("error");
      setTxError("Unsupported network. Switch to Arbitrum Sepolia or BSC Testnet.");
      return;
    }
    const failWith = (message: string) => { setTxStatus("error"); setTxError(message); };
    if (!address || !publicClient) { failWith("Connect your wallet to create a listing."); return; }
    const token = tokenAddress.trim();
    if (!isAddress(token)) { failWith("Enter a valid token contract address."); return; }
    let amount: bigint;
    let price: bigint;
    try {
      amount = parseUnits(tokenAmount, 18);
      price = parseEther(priceEth);
    } catch {
      failWith("Enter a valid token amount and price.");
      return;
    }
    if (amount <= BigInt(0) || price <= BigInt(0)) { failWith("Amount and price must be greater than zero."); return; }
    setTxStatus("pending");
    setTxError("");
    try {
      const allowance = await publicClient.readContract({
        address: token,
        abi: ABIS.token,
        functionName: "allowance",
        args: [address, p2p.address],
      });
      if (allowance < amount) {
        setStep("Step 1 of 2: approve tokens");
        const approveHash = await writeContractAsync({
          address: token,
          abi: ABIS.token,
          functionName: "approve",
          args: [p2p.address, amount],
          ...(await getFeeOverrides(publicClient)),
        });
        const approveReceipt = await waitForTransactionReceipt(config, { hash: approveHash });
        if (approveReceipt.status !== "success") { failWith("Token approval failed (reverted)."); return; }
      }
      setStep(allowance < amount ? "Step 2 of 2: create listing" : "Create listing");
      const hash = await writeContractAsync({
        address: p2p.address,
        abi: p2p.abi,
        functionName: "createListing",
        args: [token, amount, price],
        ...(await getFeeOverrides(publicClient)),
      });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") { failWith("Listing transaction failed (reverted)."); return; }
      await publishCreated(receipt.logs, p2p, publicClient, chainId, onCreated);
      setTxStatus("success");
      toast.success("Listing created", { description: "It is visible in the market now." });
      onSuccess();
      onClose();
    } catch (err) {
      if (isUserRejection(err)) {
        setTxStatus("idle");
        toast.info(WALLET_CANCELLED_MESSAGE);
      } else {
        failWith(txErrorMessage(err));
      }
    } finally {
      setStep("");
    }
  }

  const pending = txStatus === "pending";
  const amountFieldError = decimalFieldError(tokenAmount, (v) => parseUnits(v, 18));
  const priceFieldError = decimalFieldError(priceEth, (v) => parseEther(v));

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent
        title={
          <span className="panel-title">
            <ArrowLeftRight size={18} aria-hidden="true" />
            Create listing
          </span>
        }
        description="List project tokens for a fixed total price. A 1% platform fee is taken from the price when the listing is filled."
        maxWidth={520}
        hideClose={pending}
        preventDismiss={pending}
      >
        <form onSubmit={handleCreate} noValidate className="stack-md" style={{ gap: 16 }}>
          <div>
            {manualToken ? (
              <Field label="Token contract address" required>
                <Input
                  className="mono"
                  value={tokenAddress}
                  onChange={e => { setTokenAddress(e.target.value); setTokenBalance(null); }}
                  placeholder="0x..."
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                />
              </Field>
            ) : (
              <>
                <span className="label">Token</span>
                <TokenPicker
                  chainId={chainId}
                  wallet={address}
                  selected={tokenAddress}
                  networkName={chainName(chainId)}
                  onSelect={(addr, balance) => { setTokenAddress(addr); setTokenBalance(balance); }}
                />
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              style={{ marginTop: 6, paddingLeft: 0 }}
              disabled={pending}
              onClick={() => { setManualToken(m => !m); setTokenAddress(""); setTokenBalance(null); }}
            >
              {manualToken ? "Pick from my tokens" : "Use another token address"}
            </Button>
          </div>
          <Field
            label="Token amount"
            required
            error={amountFieldError ?? undefined}
            hint={tokenBalance !== null ? <>Wallet balance: <span className="num">{formatTokenAmount(tokenBalance)}</span></> : undefined}
          >
            <div className="input-row">
              <Input
                type="text"
                inputMode="decimal"
                className="num"
                value={tokenAmount}
                onChange={e => setTokenAmount(e.target.value)}
                placeholder="1000"
                disabled={pending}
              />
              {tokenBalance !== null && (
                <Button variant="secondary" disabled={pending} onClick={() => setTokenAmount(formatUnits(tokenBalance, 18))}>
                  Max
                </Button>
              )}
            </div>
          </Field>
          <Field
            label={`Total price in ${chainCurrency(chainId)}`}
            required
            error={priceFieldError ?? undefined}
            hint={receiveText ? `You receive about ${receiveText} (price minus ${PROTOCOL_FEE_BPS / 100}% fee)` : undefined}
          >
            <Input
              type="number"
              min="0.000001"
              step="0.000001"
              inputMode="decimal"
              className="num"
              value={priceEth}
              onChange={e => setPriceEth(e.target.value)}
              placeholder="0.05"
              disabled={pending}
            />
          </Field>

          {txStatus === "error" && <InlineAlert tone="danger">{txError}</InlineAlert>}
          {pending && step && (
            <p className="tx-status" role="status" style={{ marginTop: 0 }}>
              <Spinner size={12} />
              {step}: confirm in your wallet.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={amountFieldError !== null || priceFieldError !== null}>
              Create listing
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Recent trades ──────────────────────────────────────────────────────────

function RecentTrades({ chainId }: { chainId: number }) {
  const { data: trades, isLoading } = useQuery({
    queryKey: ["p2p-trades"],
    queryFn: () => fetchRecentTrades(20),
  });

  const columns: ReadonlyArray<DataTableColumn<P2PTrade>> = [
    { key: "date", header: "Date", numeric: true, cell: (t) => <span className="cell-sub" style={{ fontSize: 13 }}>{new Date(Number(t.timestamp) * 1000).toLocaleString()}</span> },
    { key: "token", header: "Token", cell: (t) => <span className="mono" style={{ fontSize: 12 }}>{shortAddr(t.tokenAddress)}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (t) => <Amount value={formatTokenAmount(t.tokenAmount)} /> },
    { key: "price", header: "Price", align: "right", cell: (t) => <Amount value={formatEth(t.pricePaid, 4)} unit={chainCurrency(t.chainId)} /> },
    { key: "seller", header: "Seller", cell: (t) => <span className="mono" style={{ fontSize: 12 }}>{shortAddr(t.seller)}</span> },
    { key: "buyer", header: "Buyer", cell: (t) => <span className="mono" style={{ fontSize: 12 }}>{shortAddr(t.buyer)}</span> },
    {
      key: "tx",
      header: "Tx",
      align: "right",
      cell: (t) => {
        const txUrl = explorerTxUrl(t.chainId, t.txHash);
        return txUrl ? (
          <a href={txUrl} target="_blank" rel="noopener noreferrer">View</a>
        ) : (
          "-"
        );
      },
    },
  ];

  return (
    <section className="section-block" aria-labelledby="trades-heading">
      <Card>
        <CardHeader title={<span id="trades-heading">Recent trades</span>} />
        <CardBody style={{ paddingLeft: 0, paddingRight: 0, paddingBottom: 4 }}>
          <div style={{ padding: "0 20px" }}>
            <IndexerLagNote chainId={chainId} />
          </div>
          <DataTable
            columns={columns}
            rows={trades ?? []}
            rowKey={(t) => t.id}
            caption="Recent trades"
            loading={isLoading}
            skeletonRows={3}
            emptyTitle="No trades yet"
            dense
          />
        </CardBody>
      </Card>
    </section>
  );
}

// ── P2P Main Content ───────────────────────────────────────────────────────

function P2PContent() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [buyTarget, setBuyTarget] = useState<P2PListing | null>(null);
  const [chainFilter, setChainFilter] = useState<ChainFilter>("all");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<P2PListing | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Optimistic state (id -> time added) bridges the indexer lag after confirmed receipts.
  const [optimistic, setOptimistic] = useState<Record<string, { listing: P2PListing; at: number }>>({});
  const [removedIds, setRemovedIds] = useState<Record<string, number>>({});
  const hasOptimistic = Object.keys(optimistic).length > 0 || Object.keys(removedIds).length > 0;

  const { data: indexed, dataUpdatedAt } = useSuspenseQuery({
    queryKey: ["p2p-listings"],
    queryFn: fetchActiveListings,
    refetchInterval: hasOptimistic ? OPTIMISTIC_REFETCH_MS : false,
  });

  // Reconcile once per indexer fetch (state adjusted during render, keyed on the fetch time).
  const [reconciledAt, setReconciledAt] = useState(0);
  if (reconciledAt !== dataUpdatedAt) {
    setReconciledAt(dataUpdatedAt);
    const ids = new Set(indexed.map((l) => l.id));
    const alive = (at: number): boolean => dataUpdatedAt - at < OPTIMISTIC_TTL_MS;
    const nextOptimistic = Object.fromEntries(
      Object.entries(optimistic).filter(([id, v]) => !ids.has(id) && alive(v.at)),
    );
    if (Object.keys(nextOptimistic).length !== Object.keys(optimistic).length) setOptimistic(nextOptimistic);
    const nextRemoved = Object.fromEntries(
      Object.entries(removedIds).filter(([id, at]) => ids.has(id) && alive(at)),
    );
    if (Object.keys(nextRemoved).length !== Object.keys(removedIds).length) setRemovedIds(nextRemoved);
  }

  const indexedIds = new Set(indexed.map((l) => l.id));
  const listings = [
    ...indexed,
    ...Object.values(optimistic).map((v) => v.listing).filter((l) => !indexedIds.has(l.id)),
  ].filter((l) => !(l.id in removedIds));

  function markRemoved(id: string) {
    setRemovedIds((prev) => ({ ...prev, [id]: Date.now() }));
    setOptimistic((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));
  }

  function addOptimistic(listing: P2PListing) {
    setOptimistic((prev) => ({ ...prev, [listing.id]: { listing, at: Date.now() } }));
  }

  const { writeContractAsync } = useWriteContract();
  const buyClient = usePublicClient();

  async function handleBuy(listing: P2PListing) {
    if (!isConnected) { toast.error("Connect your wallet to buy."); return; }
    if (chainId !== listing.chainId) { toast.error("Switch your wallet to this listing's network to buy."); return; }
    const p2p = getContractConfig(listing.chainId, "p2pExchange");
    if (!p2p) { toast.error("Unsupported network. Switch to Arbitrum Sepolia or BSC Testnet."); return; }
    setBuyingId(listing.id);
    try {
      // listing.id is composite `<chainId>:<listingId>`; the contract takes the numeric part
      const listingNumericId = listing.id.split(":")[1] ?? "";
      const hash = await writeContractAsync({
        address: p2p.address,
        abi: p2p.abi,
        functionName: "fillListing",
        args: [BigInt(listingNumericId)],
        value: BigInt(listing.priceInETH),
        ...(await getFeeOverrides(buyClient)),
      });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") { toast.error("Purchase transaction failed (reverted)."); return; }
      markRemoved(listing.id);
      toast.success("Purchase confirmed", { description: "The tokens are in your wallet." });
      queryClient.invalidateQueries({ queryKey: ["p2p-listings"] });
    } catch (err) {
      toastTxError(err, "Purchase failed");
    } finally {
      setBuyingId(null);
    }
  }

  async function handleCancel(listing: P2PListing) {
    if (!isConnected || !address || address.toLowerCase() !== listing.seller.toLowerCase()) {
      toast.error("Only the seller can cancel this listing.");
      return;
    }
    if (chainId !== listing.chainId) { toast.error("Switch your wallet to this listing's network to cancel."); return; }
    const p2p = getContractConfig(listing.chainId, "p2pExchange");
    if (!p2p) { toast.error("Unsupported network. Switch to Arbitrum Sepolia or BSC Testnet."); return; }
    setCancellingId(listing.id);
    try {
      const listingNumericId = listing.id.split(":")[1] ?? "";
      const hash = await writeContractAsync({
        address: p2p.address,
        abi: p2p.abi,
        functionName: "cancelListing",
        args: [BigInt(listingNumericId)],
        ...(await getFeeOverrides(buyClient)),
      });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") { toast.error("Cancel transaction failed (reverted)."); return; }
      markRemoved(listing.id);
      toast.success("Listing cancelled", { description: "The tokens returned to your wallet." });
      queryClient.invalidateQueries({ queryKey: ["p2p-listings"] });
    } catch (err) {
      toastTxError(err, "Cancel failed");
    } finally {
      setCancellingId(null);
    }
  }

  const volumeByChain = new Map<number, bigint>();
  for (const l of listings) {
    volumeByChain.set(l.chainId, (volumeByChain.get(l.chainId) ?? BigInt(0)) + BigInt(l.priceInETH));
  }
  const totalVolume =
    volumeByChain.size === 0
      ? `0 ${chainCurrency(chainId)}`
      : Array.from(volumeByChain.entries())
          .map(([id, v]) => `${formatTokenAmount(v)} ${chainCurrency(id)}`)
          .join(" + ");

  const chainOptions: ReadonlyArray<SegmentOption<ChainFilter>> = [
    { value: "all", label: "All chains" },
    ...SUPPORTED_CHAINS.map((c) => ({ value: String(c.id) as ChainFilter, label: chainName(c.id) })),
  ];
  const shown = chainFilter === "all" ? listings : listings.filter((l) => String(l.chainId) === chainFilter);

  function openCreate(): void {
    if (!isConnected) { toast.error("Connect your wallet to create a listing."); return; }
    setShowModal(true);
  }

  function renderAction(listing: P2PListing): React.ReactNode {
    const isSeller = !!address && address.toLowerCase() === listing.seller.toLowerCase();
    const isPending = buyingId === listing.id || cancellingId === listing.id;
    if (!address) return <span className="cell-sub">Connect wallet</span>;
    if (isSeller) {
      return (
        <Button variant="secondary" size="sm" loading={isPending} onClick={() => setCancelTarget(listing)}>
          Cancel listing
        </Button>
      );
    }
    return (
      <Button size="sm" loading={isPending} leftIcon={<ShoppingCart size={14} aria-hidden="true" />} onClick={() => setBuyTarget(listing)}>
        Buy
      </Button>
    );
  }

  const columns: ReadonlyArray<DataTableColumn<P2PListing>> = [
    {
      key: "token",
      header: "Token",
      cell: (l) => (
        <div>
          <AddressChip address={l.tokenAddress} href={explorerAddressUrl(l.chainId, l.tokenAddress) ?? undefined} />
          <div className="cell-sub" style={{ marginTop: 2 }}>
            {chainName(l.chainId)} - <span className="num">#{l.id.split(":")[1] ?? l.id}</span>
          </div>
        </div>
      ),
    },
    { key: "seller", header: "Seller", cell: (l) => <AddressChip address={l.seller} /> },
    { key: "amount", header: "Amount", align: "right", cell: (l) => <Amount value={formatTokenAmount(l.tokenAmount)} /> },
    {
      key: "unit",
      header: "Price per token",
      align: "right",
      cell: (l) => <Amount value={formatEth(pricePerToken(l).toString(), 6)} unit={chainCurrency(l.chainId)} />,
    },
    { key: "total", header: "Total", align: "right", cell: (l) => <Amount value={formatEth(l.priceInETH, 4)} unit={chainCurrency(l.chainId)} /> },
    { key: "action", header: <span className="sr-only">Action</span>, align: "right", cell: renderAction },
  ];

  const buyFee = buyTarget ? splitPrice(BigInt(buyTarget.priceInETH)) : null;
  const buyCurrency = buyTarget ? chainCurrency(buyTarget.chainId) : "";

  return (
    <div className="page-container">
      <div className="page-title-row fade-in-up">
        <div>
          <span className="eyebrow">Secondary market</span>
          <h1>P2P token exchange</h1>
          <p>Buy and sell project equity tokens directly peer to peer. No intermediary, just smart contracts.</p>
        </div>
        <div className="page-title-actions">
          <Button leftIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>
            Create listing
          </Button>
        </div>
      </div>

      <section className="kpi-grid" aria-label="Market figures">
        <StatCard label="Active listings" value={listings.length} icon={<ArrowLeftRight size={16} />} />
        <StatCard label="Total listed value" value={totalVolume} icon={<Coins size={16} />} hint="Per chain, never summed across currencies" />
        <StatCard label="Networks" value={2} hint="Arbitrum Sepolia and BSC Testnet" icon={<Network size={16} />} />
      </section>

      {!isConnected && (
        <InlineAlert tone="warning" className="panel-gap">Connect your wallet to buy tokens or create listings.</InlineAlert>
      )}

      <div className="ui-card market-toolbar">
        <div className="market-toolbar-group">
          <SegmentedControl options={chainOptions} value={chainFilter} onChange={setChainFilter} label="Filter by chain" />
        </div>
        <span className="cell-sub num" role="status">
          {shown.length} listing{shown.length === 1 ? "" : "s"}
        </span>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={20} />}
            title={listings.length === 0 ? "No active listings" : "No listings on this chain"}
            text={listings.length === 0 ? "Be the first to list project tokens on the secondary market." : "Try another chain filter."}
            action={
              listings.length === 0 ? (
                <Button leftIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>
                  Create first listing
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="table-switch">
          <Card className="only-desktop">
            <DataTable columns={columns} rows={shown} rowKey={(l) => l.id} caption="Active listings" />
          </Card>
          <div className="only-mobile">
            <div className="mobile-cards">
              {shown.map((listing) => (
                <P2PListingCard
                  key={listing.id}
                  listing={listing}
                  onBuy={(l) => setBuyTarget(l)}
                  onCancel={(l) => setCancelTarget(l)}
                  viewer={address}
                  isPending={buyingId === listing.id || cancellingId === listing.id}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <RecentTrades chainId={chainId} />

      <ConfirmDialog
        open={buyTarget !== null}
        onOpenChange={(open) => { if (!open) setBuyTarget(null); }}
        title="Buy these tokens?"
        body={
          buyTarget && buyFee ? (
            <>
              You pay <strong className="num">{formatEth(buyTarget.priceInETH, 6)} {buyCurrency}</strong> for{" "}
              <span className="num">{formatTokenAmount(buyTarget.tokenAmount)}</span> tokens. The {PROTOCOL_FEE_BPS / 100}% platform fee (
              <span className="num">{formatEth(buyFee.fee.toString(), 6)} {buyCurrency}</span>) is taken from the seller&apos;s proceeds. You also pay the network gas.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Buy tokens"
        onConfirm={async () => {
          if (buyTarget) await handleBuy(buyTarget);
        }}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title="Cancel this listing?"
        body="The tokens in this listing return to your wallet. You pay the network gas for this transaction."
        confirmLabel="Cancel listing"
        cancelLabel="Keep listing"
        tone="danger"
        onConfirm={async () => {
          if (cancelTarget) await handleCancel(cancelTarget);
        }}
      />

      {showModal && (
        <CreateListingModal
          onClose={() => setShowModal(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["p2p-listings"] })}
          onCreated={addOptimistic}
        />
      )}
    </div>
  );
}

export default function P2PPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container" role="status" aria-live="polite">
          <span className="sr-only">Loading listings</span>
          <Skeleton width="35%" height={28} style={{ marginBottom: 24 }} />
          <div className="kpi-grid">
            {[1, 2, 3].map(i => (
              <StatCard key={i} label="Loading" value="" loading />
            ))}
          </div>
          <Card>
            <DataTable columns={[{ key: "a", header: "Token", cell: () => null }, { key: "b", header: "Amount", cell: () => null }, { key: "c", header: "Total", cell: () => null }]} rows={[]} rowKey={() => ""} caption="Loading listings" loading skeletonRows={4} />
          </Card>
        </div>
      }
    >
      <P2PContent />
    </Suspense>
  );
}
