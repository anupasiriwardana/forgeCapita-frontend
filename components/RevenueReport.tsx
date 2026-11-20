"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { BarChart } from "@/components/ui/charts/BarChart";
import { chainCurrency } from "@/config/chains";
import { fetchProjectRevenue, formatEth, formatNative, shortAddr, type ProjectDto, type RevenueMonthRow } from "@/lib/api";

const PAGE = 12;
const CHART_MONTHS = 12;

/** Last CHART_MONTHS months, oldest first. Gross wei is formatted bigint-safely, then parsed for the chart axis only. */
function chartRows(months: RevenueMonthRow[]): Array<{ month: string; gross: number }> {
  return months
    .slice(0, CHART_MONTHS)
    .reverse()
    .map((m) => ({ month: m.month, gross: Number(formatEth(m.gross, 6)) }));
}

/** Founder revenue report from the indexer's monthly totals (native coin only): chart plus monthly table. */
export function RevenueReport({ project }: { project: ProjectDto }) {
  const [shown, setShown] = useState(PAGE);
  const chainId = project.chainId;
  const currency = chainCurrency(chainId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-revenue", project.id],
    queryFn: ({ signal }) => fetchProjectRevenue(chainId, project.escrowAddress, signal),
    refetchInterval: 30_000,
  });

  const columns: ReadonlyArray<DataTableColumn<RevenueMonthRow>> = [
    { key: "month", header: "Month", numeric: true, cell: (m) => m.month },
    { key: "payments", header: "Payments", align: "right", numeric: true, cell: (m) => m.paymentCount },
    { key: "gross", header: `Gross (${currency})`, align: "right", cell: (m) => <Amount value={formatEth(m.gross, 6)} /> },
    { key: "creator", header: "Developer 24%", align: "right", cell: (m) => <Amount value={formatEth(m.creatorCut, 6)} /> },
    { key: "stakers", header: "Stakers", align: "right", cell: (m) => <Amount value={formatEth(m.investorCut, 6)} /> },
    { key: "fee", header: "Platform fee", align: "right", cell: (m) => <Amount value={formatEth(m.platformFee, 6)} /> },
  ];

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div role="status" className="stack-sm">
        <span className="sr-only">Loading revenue report...</span>
        <Skeleton height={160} />
        <Skeleton width="70%" />
      </div>
    );
  } else if (isError) {
    body = <InlineAlert tone="warning">Revenue report is not available right now. Try again later.</InlineAlert>;
  } else if (!data || data.months.length === 0) {
    body = <EmptyState icon={<BarChart3 size={20} />} title="No revenue recorded yet" />;
  } else {
    const rows = chartRows(data.months);
    body = (
      <>
        <h4 className="label">Monthly revenue received ({currency})</h4>
        <BarChart
          data={rows}
          xKey="month"
          yKey="gross"
          seriesName={`Revenue (${currency})`}
          height={200}
          formatter={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          summary={`Gross revenue routed to ${project.profile?.name ?? project.tokenName} per month for the last ${rows.length} month(s) with payments, in ${currency}.`}
        />
        <div className="panel-section" style={{ marginLeft: -20, marginRight: -20, paddingTop: 0 }}>
          <DataTable
            columns={columns}
            rows={data.months.slice(0, shown)}
            rowKey={(m) => m.month}
            caption={`Monthly revenue for ${project.profile?.name ?? project.tokenName}`}
            dense
          />
        </div>
        {data.months.length > shown && (
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)} style={{ marginTop: 8 }}>
            Show more
          </Button>
        )}
        <p className="panel-note num" style={{ marginTop: 12 }}>
          Total gross {formatNative(data.totals.totalGross, chainId, 6)}, developer share{" "}
          {formatNative(data.totals.totalCreatorCut, chainId, 6)}, claimed{" "}
          {formatNative(data.totals.totalCreatorClaimed, chainId, 6)}
        </p>
      </>
    );
  }

  const router = data?.routerAddress ?? null;

  return (
    <Card>
      <CardHeader
        as="h3"
        title={
          <span className="panel-title">
            <BarChart3 size={16} aria-hidden="true" />
            Revenue report
          </span>
        }
      />
      <CardBody>
        <p className="panel-note panel-gap">
          Revenue only counts when it is sent through this project&apos;s RevenueRouter
          {router && (
            <>
              {": "}
              <span className="mono" title={router}>{shortAddr(router)}</span>
            </>
          )}
          . Only the native coin ({currency}) is audited today. Stablecoin and other ERC-20 revenue is not audited or
          supported yet: convert it to {currency} before routing. ERC-20 support is planned. Observed inflow comes from
          your registered shadow wallet, and revenue that is not routed shows up as a shortfall.
        </p>
        {body}
      </CardBody>
    </Card>
  );
}
