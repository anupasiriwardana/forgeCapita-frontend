"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import {
  fetchInvestorPositions,
  formatEth,
  listProjects,
  shortAddr,
  type InvestorPosition,
} from "@/lib/api";
import { chainCurrency, chainName } from "@/config/chains";

const ZERO = BigInt(0);

/** 18-decimals token amount, trimmed to at most 4 fractional digits. */
function formatToken(wei: string): string {
  const [whole = "0", frac = ""] = formatUnits(BigInt(wei), 18).split(".");
  const trimmed = frac.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<InvestorPosition[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setError("");
    setPositions(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchInvestorPositions(address, { limit: 100 }, signal)
      .then((res) => {
        if (!signal.aborted) setPositions(res.positions);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load positions");
      });
    listProjects({ limit: 100 }, signal)
      .then((list) => {
        if (signal.aborted) return;
        const map: Record<string, string> = {};
        for (const p of list.items) {
          if (p.profile?.name) map[p.id] = p.profile.name;
        }
        setNames(map);
      })
      .catch(() => {
        /* names are optional: fall back to token symbol / address */
      });
    return () => controller.abort();
  }, [address, reloadKey]);

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Portfolio</h1>

      {!isConnected && (
        <div className="alert alert-warning">
          <span>🔌</span> Connect your wallet to see your positions.
        </div>
      )}

      {isConnected && error && (
        <div className="alert alert-error" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span>⚠️ {error}</span>
          <button className="btn-secondary" onClick={retry}>Retry</button>
        </div>
      )}

      {isConnected && !error && positions === null && (
        <p style={{ color: "var(--text-muted)" }}>Loading positions…</p>
      )}

      {isConnected && !error && positions !== null && positions.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          No positions yet. <Link href="/">Browse projects</Link>
        </p>
      )}

      {isConnected && !error && positions !== null && positions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {positions.map((p) => {
            const net = BigInt(p.invested) - BigInt(p.refunded);
            const name = names[p.projectId] || p.tokenSymbol || shortAddr(p.escrowAddress);
            return (
              <Link
                key={p.projectId}
                href={`/projects/${encodeURIComponent(p.projectId)}`}
                className="glass-card"
                style={{ padding: "20px", textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                  <strong style={{ fontSize: "18px" }}>{name}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    {chainName(p.chainId)} · {p.state} · {p.tokenSymbol}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                  <Stat label="Invested" value={`${formatEth(net.toString())} ${chainCurrency(p.chainId)}`} />
                  {BigInt(p.refunded) !== ZERO && (
                    <Stat label="Refunded" value={`${formatEth(p.refunded)} ${chainCurrency(p.chainId)}`} />
                  )}
                  <Stat label="Staked" value={`${formatToken(p.stakedBalance)} ${p.tokenSymbol}`} />
                  <Stat label="Token balance" value={`${formatToken(p.tokensHeld)} ${p.tokenSymbol}`} />
                  <Stat label="Yield claimed" value={`${formatEth(p.yieldClaimed)} ${chainCurrency(p.chainId)}`} />
                </div>
                <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--text-muted)" }}>
                  Claimable yield: open project
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
