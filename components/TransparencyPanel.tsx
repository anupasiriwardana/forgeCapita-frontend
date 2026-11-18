"use client";

import { useEffect, useState } from "react";
import {
  formatNative,
  getProjectTransparency,
  type ComplianceState,
  type ProjectDto,
  type TransparencyDto,
} from "@/lib/api";
import { exactTime, formatAge } from "@/lib/timeAgo";
import { ScanSearch } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { CardBody, CardHeader } from "@/components/ui/Card";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";

const REFRESH_MS = 60_000;

function complianceTone(state: ComplianceState | "not_checked"): StatusTone {
  if (state === "OK" || state === "RESOLVED") return "success";
  if (state === "SHUTDOWN") return "danger";
  if (state === "WARNED" || state === "not_checked") return "warning";
  return "neutral";
}

const STATE_LINES: Record<ComplianceState | "not_checked", string> = {
  OK: "Revenue routed to the protocol matches what the project's wallet received.",
  WARNED: "Routed revenue is below what was observed. The founder has been warned.",
  ESCALATED: "The shortfall was not corrected and the case has been escalated for review.",
  RESOLVED: "A previous shortfall was reviewed and resolved.",
  SHUTDOWN: "The project was shut down after an unresolved revenue shortfall.",
  not_checked: "Not checked yet",
};

export function complianceBadge(state: ComplianceState | "not_checked" | null): string {
  if (state === "OK" || state === "RESOLVED") return "badge-active";
  if (state === "SHUTDOWN") return "badge-danger";
  if (state === "WARNED" || state === "not_checked") return "badge-pending";
  return "badge-inactive";
}

/** Integer-only percent text from basis points (e.g. 1234 -> "12.34%"). */
export function formatBps(bps: number): string {
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(bps));
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${Math.floor(abs / 100)}.${frac}%`;
}

export function TransparencyPanel({ project }: { project: ProjectDto }) {
  const [data, setData] = useState<TransparencyDto | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let controller = new AbortController();
    const run = (): void => {
      controller.abort();
      controller = new AbortController();
      getProjectTransparency(project.id, controller.signal)
        .then((d) => {
          setNow(Date.now());
          setData(d);
        })
        .catch(() => undefined);
    };
    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [project.id]);

  if (!data) return null;

  const title = (
    <span className="panel-title">
      <ScanSearch size={16} aria-hidden="true" />
      Revenue transparency
    </span>
  );
  const wallet = data.shadowWallet ? (
    <div className="kv-row">
      <span>Revenue wallet</span>
      <AddressChip address={data.shadowWallet} />
    </div>
  ) : null;

  if (data.auditStatus === "unaudited") {
    return (
      <section className="ui-card">
        <CardHeader title={title} as="h3" />
        <CardBody>
          {data.note && <p className="panel-note">{data.note}</p>}
          {wallet && <div className="kv-list">{wallet}</div>}
        </CardBody>
      </section>
    );
  }

  const state = data.complianceState ?? "not_checked";
  return (
    <section className="ui-card">
      <CardHeader
        title={title}
        as="h3"
        actions={<StatusPill tone={complianceTone(state)}>{state === "not_checked" ? "not checked" : state}</StatusPill>}
      />
      <CardBody>
        <p style={{ fontSize: "14px", marginBottom: "12px" }}>{STATE_LINES[state]}</p>
        <div className="kv-list">
          {wallet}
          <div className="kv-row">
            <span>Last checked</span>
            <span title={exactTime(data.lastCheckedAt)} className="num">{formatAge(data.lastCheckedAt, now)}</span>
          </div>
          {data.observedNative != null && data.routedNative != null && (
            <>
              <div className="kv-row">
                <span>Observed (last {data.windowDays} days)</span>
                <Amount value={formatNative(data.observedNative, data.chainId)} />
              </div>
              <div className="kv-row">
                <span>Routed (last {data.windowDays} days)</span>
                <Amount value={formatNative(data.routedNative, data.chainId)} />
              </div>
            </>
          )}
          {data.shortfallBps != null && (
            <div className="kv-row">
              <span>Shortfall</span>
              <span className="num">
                {formatBps(data.shortfallBps)} (tolerance {formatBps(data.toleranceBps)})
              </span>
            </div>
          )}
        </div>
        <p className="panel-note" style={{ marginTop: 12, fontSize: 12 }}>The check refreshes about every 15 minutes (configurable).</p>
        {state === "WARNED" && (
          <p className="panel-note" style={{ marginTop: 6, fontSize: 12 }}>
            This check uses indexed on-chain data, which can be a few minutes behind. A very recent payment may not be
            counted yet.
          </p>
        )}
      </CardBody>
    </section>
  );
}
