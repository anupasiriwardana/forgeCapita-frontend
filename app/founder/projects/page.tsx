"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FounderProjects } from "@/components/FounderProjects";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { describeFounderError, fetchLaunchEligibility, type LaunchEligibilityDto } from "@/lib/api";

function Check({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <li style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
      <StatusIcon state={ok ? "done" : "error"} label={ok ? "Done" : "Not done"} />
      {ok ? <span>{label}</span> : <Link href={href} style={{ color: "var(--brand-accent)" }}>{label}</Link>}
    </li>
  );
}

export default function FounderProjectsPage() {
  const [eligibility, setEligibility] = useState<LaunchEligibilityDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    fetchLaunchEligibility(signal)
      .then((data) => {
        if (signal.aborted) return;
        setEligibility(data);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load founder status"));
      });
    return () => controller.abort();
  }, []);

  let checklist: React.ReactNode;
  if (error) {
    checklist = <div role="alert" className="alert alert-error">{error}</div>;
  } else if (!eligibility) {
    checklist = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else {
    const { checks } = eligibility;
    checklist = (
      <section className="glass-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>
          Launch eligibility: {eligibility.eligible ? "ready" : "not ready"}
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Check ok={checks.applicationApproved} label="Application approved" href="/apply" />
          <Check ok={checks.agreementAccepted} label="Agreement accepted" href="/founder/agreement" />
          <Check ok={checks.shadowWalletAvailable} label="Approved shadow wallet available" href="/founder/wallets" />
          <Check ok={checks.repoProvisioned} label="Project repository" href="/founder/repository" />
        </ul>
      </section>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>My projects</h1>
      {checklist}
      <FounderProjects />
    </>
  );
}
