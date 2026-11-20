"use client";

import { useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { HandCoins } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { fetchProjectRevenue, formatEth, type ProjectDto, type RevenueMonthRow } from "@/lib/api";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { BarChart } from "@/components/ui/charts/BarChart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { toastTxError } from "@/lib/walletErrors";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { chainCurrency, EXPLORER_URLS } from "@/config/chains";
import { IndexerLagNote } from "@/components/IndexerLagNote";
import { useAuth } from "@/components/web3/AuthProvider";

type Addr = `0x${string}`;
type Action = "claim";

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

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

const CHART_MONTHS = 12;

/** Last CHART_MONTHS months, oldest first. Gross wei is formatted bigint-safely, then parsed for the chart axis only. */
function monthlyChartRows(months: RevenueMonthRow[]): Array<{ month: string; gross: number }> {
  return months
    .slice(0, CHART_MONTHS)
    .reverse()
    .map((m) => ({ month: m.month, gross: Number(formatEth(m.gross, 6)) }));
}

interface ClaimRow {
  amount: string;
  txHash: string;
  timestamp: string;
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
  const [optimisticClaimed, setOptimisticClaimed] = useState<{
    amount: bigint;
    baseClaimed: bigint;
    baseHashes: string[];
  } | null>(null);

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

  const claimedBase = toWei(revenue?.totals.totalCreatorClaimed);
  const indexerCaughtUp =
    optimisticClaimed !== null &&
    (claimedBase > optimisticClaimed.baseClaimed ||
      (revenue?.claims ?? []).some((c) => !optimisticClaimed.baseHashes.includes(c.txHash)));
  const shownClaimed =
    optimisticClaimed !== null && !indexerCaughtUp ? claimedBase + optimisticClaimed.amount : claimedBase;

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
    const claimAmount = pending ?? BigInt(0);
    const baseRevenue = queryClient.getQueryData<NonNullable<typeof revenue>>(revenueKey);
    setBusy(action);
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
        toast.error("Claim failed (reverted).");
        return;
      }
      setOptimisticClaimed((prev) => ({
        amount: (prev && !indexerCaughtUp ? prev.amount : BigInt(0)) + claimAmount,
        baseClaimed: prev && !indexerCaughtUp ? prev.baseClaimed : toWei(baseRevenue?.totals.totalCreatorClaimed),
        baseHashes: prev && !indexerCaughtUp ? prev.baseHashes : (baseRevenue?.claims ?? []).map((c) => c.txHash),
      }));
      toast.success("Creator funds claimed.", {
        description: "The indexer may take a little while to show the new history.",
      });
    } catch (err) {
      toastTxError(err);
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

  const lastPayment = totals?.lastPaymentAt ? new Date(Number(totals.lastPaymentAt) * 1000).toLocaleString() : "-";
  const chartRows = monthlyChartRows(revenue?.months ?? []);
  const claimColumns: ReadonlyArray<DataTableColumn<ClaimRow>> = [
    { key: "date", header: "Date", cell: (c) => new Date(Number(c.timestamp) * 1000).toLocaleDateString(), numeric: true },
    { key: "amount", header: "Amount", align: "right", cell: (c) => <Amount value={fmtWei(toWei(c.amount))} unit={currency} /> },
    {
      key: "tx",
      header: "Tx",
      align: "right",
      cell: (c) => {
        const link = txLink(chainId, c.txHash);
        return link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 12 }}>
            {c.txHash.slice(0, 8)}…{c.txHash.slice(-4)}
          </a>
        ) : (
          "-"
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader
        title={
          <span className="panel-title">
            <HandCoins size={16} aria-hidden="true" />
            Creator funds
          </span>
        }
        subtitle="Your 24% share of routed revenue. You pay the gas to claim."
      />
      <CardBody>
        <IndexerLagNote chainId={chainId} />
        {revenueLoading ? (
          <div role="status" className="stack-sm">
            <span className="sr-only">Loading revenue</span>
            <Skeleton width="60%" height={14} />
            <Skeleton width="80%" height={14} />
            <Skeleton width="50%" height={14} />
          </div>
        ) : !router ? (
          <p className="panel-note">Revenue router not indexed yet.</p>
        ) : (
          <>
            <div className="kv-list">
              <div className="kv-row">
                <span>Pending creator funds</span>
                {pending === null ? <span>Checking</span> : <Amount value={fmtWei(pending)} unit={currency} />}
              </div>
              <div className="kv-row"><span>Total revenue received</span><Amount value={fmtWei(toWei(totals?.totalGross))} unit={currency} /></div>
              <div className="kv-row"><span>Your 24% share</span><Amount value={fmtWei(toWei(totals?.totalCreatorCut))} unit={currency} /></div>
              {redirected > BigInt(0) && (
                <div className="kv-row"><span>Redirected from the zero-staker fallback</span><Amount value={fmtWei(redirected)} unit={currency} /></div>
              )}
              <div className="kv-row"><span>Total claimed</span><Amount value={fmtWei(shownClaimed)} unit={currency} /></div>
              <div className="kv-row"><span>Last payment</span><span className="num">{lastPayment}</span></div>
            </div>

            {chartRows.length > 0 && (
              <div className="panel-section">
                <h3 className="label">Monthly revenue received ({currency})</h3>
                <BarChart
                  data={chartRows}
                  xKey="month"
                  yKey="gross"
                  seriesName={`Revenue (${currency})`}
                  height={160}
                  formatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  summary={`Gross revenue routed to this project per month for the last ${chartRows.length} month(s) with payments, in ${currency}.`}
                />
              </div>
            )}

            {revenue && revenue.claims.length > 0 && (
              <div className="panel-section">
                <h3 className="label">Claim history</h3>
                <DataTable
                  columns={claimColumns}
                  rows={revenue.claims}
                  rowKey={(c) => c.txHash + c.timestamp}
                  caption="Creator fund claims"
                  dense
                />
              </div>
            )}

            <div className="panel-section stack-sm">
              <Button className="btn-block" loading={busy === "claim"} disabled={busy !== null || claimReason !== null} onClick={() => setConfirm("claim")}>
                Claim creator funds
              </Button>
              {claimReason && <p className="panel-note">{claimReason}</p>}
              <p className="panel-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Router <AddressChip address={router} />
              </p>
            </div>
          </>
        )}

        <ConfirmDialog
          open={confirm === "claim"}
          onOpenChange={(open) => { if (!open) setConfirm(null); }}
          title="Claim creator funds?"
          body={
            <>
              You pay the network gas for this transaction (it is not sponsored). All pending creator funds (
              {pending === null ? "0" : fmtWei(pending)} {currency}) are sent to your wallet.
            </>
          }
          confirmLabel="Claim creator funds"
          onConfirm={() => run("claim")}
        />
      </CardBody>
    </Card>
  );
}
