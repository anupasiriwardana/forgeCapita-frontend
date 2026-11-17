"use client";

import Link from "next/link";
import { useState } from "react";
import { ShadowWalletInfo } from "@/components/InfoDialog";
import { describeFounderError, requestShadowWallet, shortAddr, type FounderMeDto } from "@/lib/api";

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function badgeClass(status: string): string {
  return status === "approved" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-inactive";
}

export function WalletsSection({ me, onChanged }: { me: FounderMeDto; onChanged: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasPending = me.wallets.some((w) => w.status === "pending");
  const trimmed = value.trim();
  const valid = ADDRESS_REGEX.test(trimmed);

  async function submit(): Promise<void> {
    if (busy || !valid || hasPending) return;
    setBusy(true);
    setError("");
    try {
      await requestShadowWallet(trimmed);
      setValue("");
      onChanged();
    } catch (err) {
      setError(describeFounderError(err, "Could not submit the request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="wallets" className="glass-card" style={{ padding: "24px" }}>
      {me.wallets.length === 0 && <p style={{ color: "var(--text-secondary)" }}>No shadow wallets yet.</p>}
      {me.wallets.map((w) => (
        <div
          key={w.id}
          style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "14px" }}
        >
          <span title={w.address}>{shortAddr(w.address)}</span>
          <span className={`badge ${badgeClass(w.status)}`}>{w.status}</span>
          {w.reviewNote && <span style={{ color: "var(--text-secondary)" }}>{w.reviewNote}</span>}
          {w.reserved && <span className="badge badge-pending">Reserved (launch pending)</span>}
          {w.projectId ? (
            <span>
              {w.reserved ? "Project" : "Bound to project"}{" "}
              <Link href={`/projects/${encodeURIComponent(w.projectId)}`} style={{ color: "var(--brand-accent)" }}>
                {w.projectId}
              </Link>
            </span>
          ) : (
            w.status === "approved" && !w.reserved && <span style={{ color: "var(--text-secondary)" }}>Unused</span>
          )}
        </div>
      ))}
      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <label className="label" htmlFor="shadowAddress">Request a shadow wallet address</label>
          <ShadowWalletInfo />
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
          Use a dedicated wallet for one project&apos;s revenue (the payment processor settles into it). Do not use your
          login or personal wallet. Each wallet can be bound to only one project.
        </p>
        <input
          id="shadowAddress"
          className="input-field"
          placeholder="0x…"
          value={value}
          maxLength={42}
          onChange={(e) => setValue(e.target.value)}
        />
        {trimmed !== "" && !valid && (
          <p style={{ fontSize: "12px", color: "var(--rose)", marginTop: "4px" }}>Enter a 0x address with 40 hex characters</p>
        )}
        {hasPending && (
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            A request is already pending review.
          </p>
        )}
        {error && <div role="alert" className="alert alert-error" style={{ marginTop: "12px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <button type="button" className="btn-primary" disabled={busy || !valid || hasPending} onClick={() => void submit()}>
            Request
          </button>
        </div>
      </div>
    </section>
  );
}
