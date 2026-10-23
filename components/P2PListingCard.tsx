"use client";

import type { P2PListing } from "@/lib/api";
import { formatEth, shortAddr } from "@/lib/api";

interface P2PListingCardProps {
  listing: P2PListing;
  onBuy: (listing: P2PListing) => void;
  isPending?: boolean;
  index?: number;
}

export function P2PListingCard({ listing, onBuy, isPending, index = 0 }: P2PListingCardProps) {
  const priceEth = formatEth(listing.priceInETH, 4);
  const tokenAmount = Number(listing.tokenAmount).toLocaleString();

  return (
    <div
      className="glass-card fade-in-up"
      style={{ padding: "24px", animationDelay: `${index * 0.06}s` }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Token</div>
          <div style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--brand-accent)", fontWeight: 600 }}>
            {shortAddr(listing.tokenAddress)}
          </div>
        </div>
        <span className="badge badge-active">
          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
          Active
        </span>
      </div>

      {/* Divider */}
      <div className="divider" style={{ margin: "0 0 16px" }} />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <div className="stat-card">
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tokens</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{tokenAmount}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Price</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--teal)" }}>{priceEth} ETH</div>
        </div>
      </div>

      {/* Seller */}
      <div style={{ marginBottom: "16px", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Seller</span>
        <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{shortAddr(listing.seller)}</span>
      </div>

      {/* Listing ID */}
      <div style={{ marginBottom: "20px", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Listing #</span>
        <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{listing.id}</span>
      </div>

      {/* Buy Button */}
      <button
        className="btn-primary"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={() => onBuy(listing)}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <span className="spinner" style={{ width: "14px", height: "14px" }} />
            Processing...
          </>
        ) : (
          <>
            🛒 Buy for {priceEth} ETH
          </>
        )}
      </button>
    </div>
  );
}
