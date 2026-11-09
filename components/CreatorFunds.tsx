"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { fetchProjectRevenue, shortAddr, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { chainCurrency, EXPLORER_URLS } from "@/config/chains";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/components/web3/AuthProvider";

type Addr = `0x${string}`;
type Action = "claim";

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

function txLink(chainId: number, hash: string): string | null {
  if (!TX_HASH_REGEX.test(hash)) return null;
  const base = (EXPLORER_URLS as Record<number, string | undefined>)[chainId];
  if (!base || !base.startsWith("https://")) return null;
  return `${base}/tx/${hash}`;
}

/** Wei (bigint) to a decimal string trimmed to 6 places, without floating point. */
function fmtWei(wei: bigint): string {
  const [whole, frac = ""] = formatUnits(wei, 18).split(".");
  return `${whole}.${frac.padEnd(6, "0").slice(0, 6)}`;
}

function toWei(value: string | null | undefined): bigint {
  return value ? BigInt(value) : BigInt(0);
}

/**
 * Developer-only revenue router card. Mirrors RevenueRouter.claimCreatorFunds():
 * require(creatorPendingFunds > 0, "No funds to claim") and
 * require(msg.sender == IMilestoneEscrow(milestoneEscrow).developer(), "Only active developer can claim").
 * routePayment() is intentionally not exposed in the UI: revenue is routed by the founder's payment
 * process and reconciled separately. The claim is not relayed; the developer pays the gas.
 */
export function CreatorFunds({ project }: { project: ProjectDto }) {
  const { address } = useAccount();
  const { user } = useAuth();
  const walletChainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const feeClient = usePublicClient({ chainId: project.chainId });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const chainId = project.chainId;
  const currency = chainCurrency(chainId);
  const developer = project.developer.toLowerCase();
  const walletIsDeveloper = developer === address?.toLowerCase();
  const isDeveloper = walletIsDeveloper || developer === user?.address.toLowerCase();
  const wrongChain = walletChainId !== chainId;
  const revenueKey = ["project-revenue", project.id] as const;

  const { data: revenue, isLoading: revenueLoading } = useQuery({
    queryKey: revenueKey,
    queryFn: ({ signal }) => fetchProjectRevenue(chainId, project.escrowAddress, signal),
    enabled: isDeveloper,
    refetchInterval: 30_000,
  });
  const router = (revenue?.routerAddress ?? null) as Addr | null;

  const { data: reads } = useReadContracts({
    allowFailure: true,
    contracts: router
      ? [{ address: router, abi: ABIS.router, functionName: "creatorPendingFunds", chainId }]
      : [],
    query: { enabled: isDeveloper && router !== null, refetchInterval: 10_000 },
  });

  if (!isDeveloper) return null;

  const pendingRaw = reads?.[0]?.result;
  const pending = typeof pendingRaw === "bigint" ? pendingRaw : null;
  const totals = revenue?.totals;
  const redirected = toWei(totals?.totalRedirectedToCreator);

  let networkReason: string | null = null;
  if (!walletIsDeveloper) networkReason = "Connect the developer wallet";
  else if (wrongChain) networkReason = "Switch your wallet to this project's network";

  let claimReason: string | null = null;
  if (pending === null) claimReason = "Checking on-chain state...";
  else if (pending === BigInt(0)) claimReason = "Nothing to claim yet";
  else claimReason = networkReason;

  async function run(action: Action): Promise<void> {
    if (!router) return;
    setBusy(action);
    setResult(null);
    try {
      const fees = await getFeeOverrides(feeClient);
      const hash = await writeContractAsync({
        address: router,
        abi: ABIS.router,
        functionName: "claimCreatorFunds",
        chainId,
        ...fees,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      if (receipt.status !== "success") {
        setResult({ ok: false, text: "Claim failed (reverted)." });
        return;
      }
      setResult({
        ok: true,
        text: "Creator funds claimed. The indexer may take a few minutes to show the new history.",
      });
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(null);
      setConfirm(null);
      await queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "readContracts" ||
          q.queryKey[0] === "balance" ||
          ((q.queryKey[0] === "project" || q.queryKey[0] === "project-revenue") && q.queryKey[1] === project.id),
      });
    }
  }

  const lastPayment = totals?.lastPaymentAt ? new Date(Number(totals.lastPaymentAt) * 1000).toLocaleString() : "—";

  return (
    <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Creator funds</h2>
      {revenueLoading ? (
        <p style={MUTED}>Loading revenue...</p>
      ) : !router ? (
        <p style={MUTED}>Revenue router not indexed yet.</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: "4px", ...MUTED, marginBottom: "16px" }}>
            <span>Pending creator funds: <strong>{pending === null ? "…" : `${fmtWei(pending)} ${currency}`}</strong></span>
            <span>Total revenue received: <strong>{fmtWei(toWei(totals?.totalGross))} {currency}</strong></span>
            <span>Your 24% share: <strong>{fmtWei(toWei(totals?.totalCreatorCut))} {currency}</strong></span>
            {redirected > BigInt(0) && (
              <span>Redirected from the zero-staker fallback: <strong>{fmtWei(redirected)} {currency}</strong></span>
            )}
            <span>Total claimed: <strong>{fmtWei(toWei(totals?.totalCreatorClaimed))} {currency}</strong></span>
            <span>Last payment: <strong>{lastPayment}</strong></span>
          </div>

          {revenue && revenue.claims.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table style={{ width: "100%", fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Date</th>
                    <th style={{ textAlign: "left" }}>Amount</th>
                    <th style={{ textAlign: "left" }}>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.claims.map((c) => {
                    const link = txLink(chainId, c.txHash);
                    return (
                      <tr key={c.txHash + c.timestamp}>
                        <td>{new Date(Number(c.timestamp) * 1000).toLocaleString()}</td>
                        <td>{fmtWei(toWei(c.amount))} {currency}</td>
                        <td style={{ fontFamily: "monospace" }}>
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              {c.txHash.slice(0, 8)}…{c.txHash.slice(-4)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%" }}
            disabled={busy !== null || claimReason !== null}
            onClick={() => setConfirm("claim")}
          >
            {busy === "claim" ? "Waiting for confirmation..." : "Claim creator funds"}
          </button>
          {claimReason && <p style={{ ...MUTED, margin: "8px 0 0" }}>{claimReason}</p>}

          <p style={{ ...MUTED, margin: "8px 0 0" }}>Router: <span style={{ fontFamily: "monospace" }}>{shortAddr(router)}</span></p>
        </>
      )}

      <ConfirmDialog
        open={confirm === "claim"}
        title="Claim creator funds?"
        confirmLabel="Claim creator funds"
        busy={busy !== null}
        onConfirm={() => void run("claim")}
        onCancel={() => setConfirm(null)}
      >
        You pay the network gas for this transaction (it is not sponsored). All pending creator funds (
        {pending === null ? "0" : fmtWei(pending)} {currency}) are sent to your wallet.
      </ConfirmDialog>

      {result && (
        <div className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: "16px" }}>
          <span>{result.ok ? "✅" : "⚠️"}</span>
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}
