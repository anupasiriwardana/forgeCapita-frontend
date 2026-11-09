"use client";

import { useEffect, useState } from "react";
import {
  formatNative,
  getProjectTransparency,
  shortAddr,
  type ComplianceState,
  type ProjectDto,
  type TransparencyDto,
} from "@/lib/api";

const REFRESH_MS = 60_000;
const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;

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

  useEffect(() => {
    let controller = new AbortController();
    const run = (): void => {
      controller.abort();
      controller = new AbortController();
      getProjectTransparency(project.id, controller.signal)
        .then(setData)
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

  const wallet = data.shadowWallet ? (
    <p style={MUTED}>
      Revenue wallet: <span title={data.shadowWallet}>{shortAddr(data.shadowWallet)}</span>
    </p>
  ) : null;

  if (data.auditStatus === "unaudited") {
    return (
      <section className="glass-card" style={{ padding: "24px" }}>
        <h3 style={{ fontSize: "18px", marginBottom: "8px" }}>Revenue transparency</h3>
        {data.note && <p style={MUTED}>{data.note}</p>}
        {wallet}
      </section>
    );
  }

  const state = data.complianceState ?? "not_checked";
  return (
    <section className="glass-card" style={{ padding: "24px" }}>
      <h3 style={{ fontSize: "18px", marginBottom: "8px" }}>Revenue transparency</h3>
      <p style={{ marginBottom: "8px" }}>
        <span className={`badge ${complianceBadge(state)}`}>{state === "not_checked" ? "not checked" : state}</span>
      </p>
      <p style={{ fontSize: "14px", marginBottom: "8px" }}>{STATE_LINES[state]}</p>
      {wallet}
      <p style={MUTED}>
        Last checked: {data.lastCheckedAt ? new Date(data.lastCheckedAt).toLocaleString() : "never"}
      </p>
      {data.observedNative != null && data.routedNative != null && (
        <p style={{ fontSize: "14px", marginTop: "8px" }}>
          Observed {formatNative(data.observedNative, data.chainId)} vs routed{" "}
          {formatNative(data.routedNative, data.chainId)} (last {data.windowDays} days)
        </p>
      )}
      {data.shortfallBps != null && (
        <p style={MUTED}>
          Shortfall {formatBps(data.shortfallBps)} (tolerance {formatBps(data.toleranceBps)})
        </p>
      )}
    </section>
  );
}
