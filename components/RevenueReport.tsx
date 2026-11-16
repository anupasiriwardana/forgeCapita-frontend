"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chainCurrency } from "@/config/chains";
import { fetchProjectRevenue, formatNative, shortAddr, type ProjectDto } from "@/lib/api";

const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;
const PAGE = 12;

/** Collapsed founder revenue report from the indexer's monthly totals (native coin only). */
export function RevenueReport({ project }: { project: ProjectDto }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const chainId = project.chainId;
  const currency = chainCurrency(chainId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-revenue", project.id],
    queryFn: ({ signal }) => fetchProjectRevenue(chainId, project.escrowAddress, signal),
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });

  let body: React.ReactNode = null;
  if (open) {
    if (isLoading) {
      body = <p style={MUTED}>Loading revenue report...</p>;
    } else if (isError) {
      body = <p style={MUTED}>Revenue report is not available right now. Try again later.</p>;
    } else if (!data || data.months.length === 0) {
      body = <p style={MUTED}>No revenue recorded yet</p>;
    } else {
      const rows = data.months.slice(0, shown);
      body = (
        <>
          <div style={{ overflowX: "auto", marginBottom: "8px" }}>
            <table style={{ width: "100%", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Month</th>
                  <th style={{ textAlign: "left" }}>Payments</th>
                  <th style={{ textAlign: "left" }}>Gross</th>
                  <th style={{ textAlign: "left" }}>Developer 24%</th>
                  <th style={{ textAlign: "left" }}>Stakers</th>
                  <th style={{ textAlign: "left" }}>Platform fee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.paymentCount}</td>
                    <td>{formatNative(m.gross, chainId, 6)}</td>
                    <td>{formatNative(m.creatorCut, chainId, 6)}</td>
                    <td>{formatNative(m.investorCut, chainId, 6)}</td>
                    <td>{formatNative(m.platformFee, chainId, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.months.length > shown && (
            <button type="button" className="btn-secondary" onClick={() => setShown((n) => n + PAGE)}>
              Show more
            </button>
          )}
          <p style={{ fontSize: "14px", margin: "8px 0 0" }}>
            Total gross {formatNative(data.totals.totalGross, chainId, 6)}, developer share{" "}
            {formatNative(data.totals.totalCreatorCut, chainId, 6)}, claimed{" "}
            {formatNative(data.totals.totalCreatorClaimed, chainId, 6)}
          </p>
        </>
      );
    }
  }

  const router = data?.routerAddress ?? null;

  return (
    <details
      style={{ marginTop: "12px" }}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary style={{ cursor: "pointer", fontSize: "14px" }}>Revenue report</summary>
      <div style={{ marginTop: "8px" }}>
        <p style={{ ...MUTED, marginBottom: "6px" }}>
          Revenue only counts when it is sent through this project&apos;s RevenueRouter
          {router && (
            <>
              {": "}
              <span style={{ fontFamily: "monospace" }} title={router}>{shortAddr(router)}</span>
            </>
          )}
          . Only the native coin ({currency}) is audited today. Stablecoin and other ERC-20 revenue is not audited or
          supported yet: convert it to {currency} before routing. ERC-20 support is planned. Observed inflow comes from
          your registered shadow wallet, and revenue that is not routed shows up as a shortfall.
        </p>
        {body}
      </div>
    </details>
  );
}
