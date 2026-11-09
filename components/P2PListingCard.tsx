"use client";

import type { P2PListing } from "@/lib/api";
import { formatEth, shortAddr } from "@/lib/api";
import { chainCurrency } from "@/config/chains";

/** Protocol fee in basis points, taken from the price at fill (mirrors the contract). */
export const PROTOCOL_FEE_BPS = 100;

/** Fee and seller proceeds for a price in wei (bigint math only). */
export function splitPrice(priceWei: bigint): { fee: bigint; proceeds: bigint } {
  const fee = (priceWei * BigInt(PROTOCOL_FEE_BPS)) / BigInt(10000);
  return { fee, proceeds: priceWei - fee };
}

interface P2PListingCardProps {
  listing: P2PListing;
  onBuy: (listing: P2PListing) => void;
  onCancel: (listing: P2PListing) => void;
  /** Connected wallet address; undefined when signed out. */
  viewer?: string;
  isPending?: boolean;
  index?: number;
}

export function P2PListingCard({ listing, onBuy, onCancel, viewer, isPending, index = 0 }: P2PListingCardProps) {
  const currency = chainCurrency(listing.chainId);
  const priceEth = `${formatEth(listing.priceInETH, 4)} ${currency}`;
  const isSeller = !!viewer && viewer.toLowerCase() === listing.seller.toLowerCase();
  const { fee, proceeds } = splitPrice(BigInt(listing.priceInETH));
  const feeText = `${formatEth(fee.toString(), 6)} ${currency}`;
  const proceedsText = `${formatEth(proceeds.toString(), 6)} ${currency}`;
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
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--teal)" }}>{priceEth}</div>
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
        <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{listing.id.split(":")[1] ?? listing.id}</span>
      </div>

      {/* Fees */}
      <div style={{ marginBottom: "20px", fontSize: "12px", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Platform fee {PROTOCOL_FEE_BPS / 100}%</span>
          <span style={{ fontFamily: "monospace" }}>{feeText}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Seller receives</span>
          <span style={{ fontFamily: "monospace" }}>{proceedsText}</span>
        </div>
      </div>

      {/* Actions */}
      {!viewer ? (
        <div style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
          Connect your wallet to buy or manage this listing.
        </div>
      ) : isSeller ? (
        <button
          className="btn-secondary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => onCancel(listing)}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <span className="spinner" style={{ width: "14px", height: "14px" }} />
              Processing...
            </>
          ) : (
            "Cancel listing"
          )}
        </button>
      ) : (
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
              🛒 Buy for {priceEth}
            </>
          )}
        </button>
      )}
    </div>
  );
}
