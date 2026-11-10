"use client";

import { useState, Suspense } from "react";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWriteContract, useAccount, useChainId, useConfig, usePublicClient } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { isAddress, parseEther, parseUnits, parseEventLogs, formatUnits, type PublicClient, type TransactionReceipt } from "viem";
import { fetchActiveListings, fetchRecentTrades, formatEth, shortAddr, type P2PListing } from "@/lib/api";
import { formatTokenAmount } from "@/lib/format";
import { TokenPicker } from "@/components/TokenPicker";
import { P2PListingCard, PROTOCOL_FEE_BPS, splitPrice } from "@/components/P2PListingCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { explorerTxUrl } from "@/components/admin/shared";
import { ABIS, getContractConfig } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { chainCurrency, chainName } from "@/config/chains";

/** How long an optimistic entry may outlive the indexer before it is dropped. */
const OPTIMISTIC_TTL_MS = 10 * 60 * 1000;
const OPTIMISTIC_REFETCH_MS = 5000;

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
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      failWith(e.shortMessage ?? e.message ?? "Transaction failed");
    } finally {
      setStep("");
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", margin: 0 }}>💱 Create Listing</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "22px", cursor: "pointer", padding: "4px" }}
          >
            ×
          </button>
        </div>

        {txStatus === "success" ? (
          <div className="alert alert-success">
            <span>✅</span>
            <span>Listing created and visible now.</span>
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label className="label">Token</label>
                {manualToken ? (
                  <input
                    className="input-field"
                    value={tokenAddress}
                    onChange={e => { setTokenAddress(e.target.value); setTokenBalance(null); }}
                    placeholder="0x..."
                    required
                  />
                ) : (
                  <TokenPicker
                    chainId={chainId}
                    wallet={address}
                    selected={tokenAddress}
                    networkName={chainName(chainId)}
                    onSelect={(addr, balance) => { setTokenAddress(addr); setTokenBalance(balance); }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => { setManualToken(m => !m); setTokenAddress(""); setTokenBalance(null); }}
                  style={{ background: "none", border: "none", color: "var(--brand-accent)", cursor: "pointer", fontSize: "12px", padding: "6px 0" }}
                >
                  {manualToken ? "Pick from my tokens" : "Use another token address"}
                </button>
              </div>
              <div>
                <label className="label">Token Amount</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="input-field"
                    type="text"
                    inputMode="decimal"
                    value={tokenAmount}
                    onChange={e => setTokenAmount(e.target.value)}
                    placeholder="1000"
                    required
                  />
                  {tokenBalance !== null && (
                    <button type="button" className="btn-secondary" onClick={() => setTokenAmount(formatUnits(tokenBalance, 18))}>
                      Max
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Price in {chainCurrency(chainId)}</label>
                <input
                  className="input-field"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={priceEth}
                  onChange={e => setPriceEth(e.target.value)}
                  placeholder="0.05"
                  required
                />
                {receiveText && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
                    You receive about {receiveText} (price minus {PROTOCOL_FEE_BPS / 100}% fee)
                  </div>
                )}
              </div>

              {txStatus === "error" && (
                <div className="alert alert-error">
                  <span>⚠️</span>
                  <span style={{ fontSize: "13px" }}>{txError}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={txStatus === "pending"}>
                  {txStatus === "pending" ? (
                    <><span className="spinner" style={{ width: "14px", height: "14px" }} /> {step || "Creating..."}</>
                  ) : "Create Listing"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Recent trades ──────────────────────────────────────────────────────────

function RecentTrades({ chainId }: { chainId: number }) {
  const { data: trades, isLoading } = useQuery({
    queryKey: ["p2p-trades"],
    queryFn: () => fetchRecentTrades(20),
  });

  return (
    <section style={{ marginTop: "56px" }}>
      <h2 style={{ fontSize: "22px", marginBottom: "12px" }}>Recent trades</h2>
      <IndexerLagNote chainId={chainId} />
      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading trades...</p>
      ) : !trades || trades.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No trades yet</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "8px" }}>Date</th>
                <th style={{ padding: "8px" }}>Token</th>
                <th style={{ padding: "8px" }}>Amount</th>
                <th style={{ padding: "8px" }}>Price</th>
                <th style={{ padding: "8px" }}>Seller</th>
                <th style={{ padding: "8px" }}>Buyer</th>
                <th style={{ padding: "8px" }}>Tx</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const txUrl = explorerTxUrl(t.chainId, t.txHash);
                return (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px" }}>{new Date(Number(t.timestamp) * 1000).toLocaleString()}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace" }}>{shortAddr(t.tokenAddress)}</td>
                    <td style={{ padding: "8px" }}>{formatTokenAmount(t.tokenAmount)}</td>
                    <td style={{ padding: "8px" }}>{formatEth(t.pricePaid, 4)} {chainCurrency(t.chainId)}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace" }}>{shortAddr(t.seller)}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace" }}>{shortAddr(t.buyer)}</td>
                    <td style={{ padding: "8px" }}>
                      {txUrl ? (
                        <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-accent)" }}>View</a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  const [buyError, setBuyError] = useState("");

  async function handleBuy(listing: P2PListing) {
    if (!isConnected) { setBuyError("Connect your wallet to buy."); return; }
    if (chainId !== listing.chainId) { setBuyError("Switch your wallet to this listing's network to buy."); return; }
    const p2p = getContractConfig(listing.chainId, "p2pExchange");
    if (!p2p) { setBuyError("Unsupported network. Switch to Arbitrum Sepolia or BSC Testnet."); return; }
    setBuyingId(listing.id);
    setBuyError("");
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
      if (receipt.status !== "success") { setBuyError("Purchase transaction failed (reverted)."); return; }
      markRemoved(listing.id);
      queryClient.invalidateQueries({ queryKey: ["p2p-listings"] });
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuyingId(null);
    }
  }

  async function handleCancelConfirmed() {
    const listing = cancelTarget;
    if (!listing) return;
    setCancelTarget(null);
    if (!isConnected || !address || address.toLowerCase() !== listing.seller.toLowerCase()) {
      setBuyError("Only the seller can cancel this listing.");
      return;
    }
    if (chainId !== listing.chainId) { setBuyError("Switch your wallet to this listing's network to cancel."); return; }
    const p2p = getContractConfig(listing.chainId, "p2pExchange");
    if (!p2p) { setBuyError("Unsupported network. Switch to Arbitrum Sepolia or BSC Testnet."); return; }
    setCancellingId(listing.id);
    setBuyError("");
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
      if (receipt.status !== "success") { setBuyError("Cancel transaction failed (reverted)."); return; }
      markRemoved(listing.id);
      queryClient.invalidateQueries({ queryKey: ["p2p-listings"] });
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      setBuyError(e.shortMessage ?? e.message ?? "Cancel failed");
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

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div className="fade-in-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "48px", flexWrap: "wrap", gap: "20px" }}>
        <div>
          <span className="section-tag">💱 Secondary Market</span>
          <h1 style={{ fontSize: "36px", margin: "0 0 12px" }}>
            P2P <span className="gradient-text-teal">Token Exchange</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "16px", lineHeight: 1.6, maxWidth: "480px" }}>
            Buy and sell project equity tokens directly peer-to-peer. No intermediary, just smart contracts.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={() => {
            if (!isConnected) { setBuyError("Connect your wallet to create a listing."); return; }
            setShowModal(true);
          }}
          style={{ alignSelf: "flex-start", padding: "14px 24px" }}
        >
          + Create Listing
        </button>
      </div>

      {/* Stats bar */}
      <div
        className="fade-in-up"
        style={{
          display: "flex",
          gap: "24px",
          marginBottom: "40px",
          padding: "20px 24px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Active Listings</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)" }}>{listings.length}</div>
        </div>
        <div style={{ width: "1px", background: "var(--border)" }} />
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Listed Value</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--teal)" }}>{totalVolume}</div>
        </div>
        <div style={{ width: "1px", background: "var(--border)" }} />
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Network</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--brand-accent)" }}>Arbitrum Sepolia &amp; BSC Testnet</div>
        </div>
      </div>

      {/* Wallet/Error alerts */}
      {!isConnected && (
        <div className="alert alert-warning fade-in-up" style={{ marginBottom: "24px" }}>
          <span>🔌</span> Connect your wallet to buy tokens or create listings.
        </div>
      )}
      {buyError && (
        <div className="alert alert-error fade-in-up" style={{ marginBottom: "24px" }}>
          <span>⚠️</span> {buyError}
        </div>
      )}

      {/* Listings grid */}
      {listings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>📭</div>
          <h2 style={{ fontSize: "22px", marginBottom: "8px" }}>No Active Listings</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
            Be the first to list project tokens on the secondary market.
          </p>
          <button className="btn-primary" onClick={() => isConnected && setShowModal(true)}>
            + Create First Listing
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}>
          {listings.map((listing, i) => (
            <P2PListingCard
              key={listing.id}
              listing={listing}
              onBuy={handleBuy}
              onCancel={(l) => setCancelTarget(l)}
              viewer={address}
              isPending={buyingId === listing.id || cancellingId === listing.id}
              index={i}
            />
          ))}
        </div>
      )}

      <RecentTrades chainId={chainId} />

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this listing?"
        confirmLabel="Cancel listing"
        cancelLabel="Keep listing"
        tone="danger"
        busy={cancellingId !== null}
        onConfirm={handleCancelConfirmed}
        onCancel={() => setCancelTarget(null)}
      >
        The tokens in this listing return to your wallet. You pay the network gas for this transaction.
      </ConfirmDialog>

      {/* Modal */}
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
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-card" style={{ padding: "24px", height: "280px", opacity: 0.5 }} />
            ))}
          </div>
        </div>
      }
    >
      <P2PContent />
    </Suspense>
  );
}
