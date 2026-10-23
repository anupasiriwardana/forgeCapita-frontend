"use client";

import { useState, Suspense } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther, parseUnits } from "viem";
import { fetchActiveListings, type P2PListing, shortAddr, formatEth } from "@/lib/api";
import { P2PListingCard } from "@/components/P2PListingCard";
import P2PExchangeABI from "@/config/abis/P2PExchange.json";

const P2P_ADDRESS = process.env.NEXT_PUBLIC_P2P_ADDRESS as `0x${string}`;

// ── Create Listing Modal ───────────────────────────────────────────────────

function CreateListingModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState("");

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  useWaitForTransactionReceipt({ hash: txHash });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setTxStatus("pending");
    setTxError("");
    try {
      const hash = await writeContractAsync({
        address: P2P_ADDRESS,
        abi: P2PExchangeABI.abi,
        functionName: "createListing",
        args: [
          tokenAddress as `0x${string}`,
          parseUnits(tokenAmount, 18),
          parseEther(priceEth),
        ],
      });
      setTxHash(hash);
      setTxStatus("success");
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err) {
      setTxStatus("error");
      setTxError(err instanceof Error ? err.message : "Transaction failed");
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
            <span>Listing created! The P2P market will update shortly.</span>
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label className="label">Token Contract Address</label>
                <input
                  className="input-field"
                  value={tokenAddress}
                  onChange={e => setTokenAddress(e.target.value)}
                  placeholder="0x..."
                  required
                />
              </div>
              <div>
                <label className="label">Token Amount</label>
                <input
                  className="input-field"
                  type="number"
                  min="1"
                  step="1"
                  value={tokenAmount}
                  onChange={e => setTokenAmount(e.target.value)}
                  placeholder="1000"
                  required
                />
              </div>
              <div>
                <label className="label">Price in ETH</label>
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
                    <><span className="spinner" style={{ width: "14px", height: "14px" }} /> Creating...</>
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

// ── P2P Main Content ───────────────────────────────────────────────────────

function P2PContent() {
  const { isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const { data: listings } = useSuspenseQuery({
    queryKey: ["p2p-listings"],
    queryFn: fetchActiveListings,
  });

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [buyError, setBuyError] = useState("");
  useWaitForTransactionReceipt({ hash: txHash });

  async function handleBuy(listing: P2PListing) {
    if (!isConnected) { setBuyError("Connect your wallet to buy."); return; }
    setBuyingId(listing.id);
    setBuyError("");
    try {
      const hash = await writeContractAsync({
        address: P2P_ADDRESS,
        abi: P2PExchangeABI.abi,
        functionName: "fillListing",
        args: [BigInt(listing.id)],
        value: BigInt(listing.priceInETH),
      });
      setTxHash(hash);
      // Optimistically remove the listing from UI
      queryClient.invalidateQueries({ queryKey: ["p2p-listings"] });
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuyingId(null);
    }
  }

  const totalVolume = listings.reduce((sum, l) => sum + Number(BigInt(l.priceInETH)), 0) / 1e18;

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
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--teal)" }}>{totalVolume.toFixed(4)} ETH</div>
        </div>
        <div style={{ width: "1px", background: "var(--border)" }} />
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Network</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--brand-accent)" }}>Sepolia</div>
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
              isPending={buyingId === listing.id}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CreateListingModal
          onClose={() => setShowModal(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["p2p-listings"] })}
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
