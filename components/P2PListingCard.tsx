"use client";

import { ShoppingCart } from "lucide-react";
import type { P2PListing } from "@/lib/api";
import { formatEth } from "@/lib/api";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { chainCurrency } from "@/config/chains";
import { formatTokenAmount } from "@/lib/format";

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
  const tokenAmount = formatTokenAmount(listing.tokenAmount);

  return (
    <div className="ui-card mobile-card fade-in-up" style={{ animationDelay: `${Math.min(index, 5) * 0.03}s` }}>
      <div className="mobile-card-head">
        <div style={{ minWidth: 0 }}>
          <AddressChip address={listing.tokenAddress} />
          <div className="cell-sub" style={{ marginTop: 4 }}>
            Listing <span className="num">#{listing.id.split(":")[1] ?? listing.id}</span>
          </div>
        </div>
        <StatusPill tone="success">Active</StatusPill>
      </div>

      <div className="kv-list">
        <div className="kv-row"><span>Tokens</span><Amount value={tokenAmount} /></div>
        <div className="kv-row"><span>Price</span><Amount value={formatEth(listing.priceInETH, 4)} unit={currency} /></div>
        <div className="kv-row"><span>Seller</span><AddressChip address={listing.seller} /></div>
        <div className="kv-row"><span>Platform fee {PROTOCOL_FEE_BPS / 100}%</span><Amount value={formatEth(fee.toString(), 6)} unit={currency} /></div>
        <div className="kv-row"><span>Seller receives</span><Amount value={formatEth(proceeds.toString(), 6)} unit={currency} /></div>
      </div>

      <div style={{ marginTop: 12 }}>
        {!viewer ? (
          <p className="panel-note" style={{ textAlign: "center" }}>Connect your wallet to buy or manage this listing.</p>
        ) : isSeller ? (
          <Button variant="secondary" className="btn-block" loading={isPending} onClick={() => onCancel(listing)}>
            Cancel listing
          </Button>
        ) : (
          <Button className="btn-block" loading={isPending} leftIcon={<ShoppingCart size={16} aria-hidden="true" />} onClick={() => onBuy(listing)}>
            Buy for {priceEth}
          </Button>
        )}
      </div>
    </div>
  );
}
