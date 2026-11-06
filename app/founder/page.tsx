"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  ApiError,
  acceptAgreement,
  describeFounderError,
  fetchAgreement,
  fetchFounderMe,
  fetchLaunchEligibility,
  requestShadowWallet,
  shortAddr,
  type FounderMeDto,
  type LaunchEligibilityDto,
} from "@/lib/api";

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const MIN_NAME = 2;
const MAX_NAME = 120;

function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    (typeof e.message === "string" && /user rejected|user denied/i.test(e.message))
  );
}

function badgeClass(status: string): string {
  return status === "approved" ? "badge-active" : status === "pending" ? "badge-pending" : "badge-inactive";
}

function Check({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <li style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
      <span style={{ color: ok ? "var(--emerald)" : "var(--rose)", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
      {ok ? <span>{label}</span> : <Link href={href} style={{ color: "var(--brand-accent)" }}>{label}</Link>}
    </li>
  );
}

function AgreementSection({ me, onChanged }: { me: FounderMeDto; onChanged: () => void }) {
  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accepted = me.agreement;

  useEffect(() => {
    if (accepted) return;
    const controller = new AbortController();
    fetchAgreement(controller.signal)
      .then((a) => {
        if (!controller.signal.aborted) setText(a.text);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(describeFounderError(err, "Failed to load agreement"));
      });
    return () => controller.abort();
  }, [accepted]);

  const trimmed = name.trim();

  async function submit(): Promise<void> {
    if (busy || trimmed.length < MIN_NAME || !address) return;
    setBusy(true);
    setError("");
    try {
      const agreement = await fetchAgreement();
      const issuedAt = new Date().toISOString();
      const message = agreement.messageTemplate
        .replace("{name}", () => trimmed)
        .replace("{wallet}", () => getAddress(address))
        .replace("{issuedAt}", () => issuedAt);
      const signature = await signMessageAsync({ message });
      await acceptAgreement({ typedName: trimmed, issuedAt, signature });
      onChanged();
    } catch (err) {
      if (isUserRejection(err)) setError("Signature request was rejected.");
      else if (err instanceof ApiError && err.status === 409) onChanged();
      else if (err instanceof ApiError && err.status === 400 && /time window/i.test(err.message)) {
        setError("Check your computer clock and try again");
      } else setError(describeFounderError(err, "Could not accept the agreement"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="agreement" className="glass-card" style={{ padding: "24px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Revenue share agreement</h2>
      {accepted ? (
        <p>
          Accepted v{accepted.version} on {new Date(accepted.acceptedAt).toLocaleString()}
        </p>
      ) : (
        <>
          <pre
            className="whitespace-pre-wrap"
            style={{ maxHeight: "320px", overflowY: "auto", fontSize: "13px", padding: "12px", border: "1px solid var(--border)", borderRadius: "8px" }}
          >
            {text ?? "Loading…"}
          </pre>
          <div style={{ marginTop: "12px" }}>
            <label className="label" htmlFor="typedName">Type your full legal name</label>
            <input
              id="typedName"
              className="input-field"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <div role="alert" className="alert alert-error" style={{ marginTop: "12px" }}>{error}</div>}
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: "12px" }}
            disabled={busy || trimmed.length < MIN_NAME || text === null}
            onClick={() => void submit()}
          >
            {busy ? "Waiting…" : "Sign and accept"}
          </button>
        </>
      )}
    </section>
  );
}

function WalletsSection({ me, onChanged }: { me: FounderMeDto; onChanged: () => void }) {
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
      <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Shadow wallets</h2>
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
        <label className="label" htmlFor="shadowAddress">Request a shadow wallet address</label>
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

function FounderDashboard() {
  const [me, setMe] = useState<FounderMeDto | null>(null);
  const [eligibility, setEligibility] = useState<LaunchEligibilityDto | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchFounderMe(signal), fetchLaunchEligibility(signal)])
      .then(([meData, eligibilityData]) => {
        if (signal.aborted) return;
        setMe(meData);
        setEligibility(eligibilityData);
        setError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load founder status"));
      });
    return () => controller.abort();
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (error) return <div role="alert" className="alert alert-error">{error}</div>;
  if (!me || !eligibility) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;

  const { checks } = eligibility;
  return (
    <>
      <section className="glass-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>
          Launch eligibility: {eligibility.eligible ? "ready" : "not ready"}
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <Check ok={checks.applicationApproved} label="Application approved" href="/apply" />
          <Check ok={checks.agreementAccepted} label="Agreement accepted" href="#agreement" />
          <Check ok={checks.shadowWalletAvailable} label="Approved shadow wallet available" href="#wallets" />
        </ul>
      </section>
      <AgreementSection me={me} onChanged={reload} />
      <WalletsSection me={me} onChanged={reload} />
    </>
  );
}

export default function FounderPage() {
  const { user, role, loading, signIn } = useAuth();
  let content: React.ReactNode;
  if (loading && !user) {
    content = <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  } else if (!user) {
    content = (
      <div className="alert alert-warning" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span>Please sign in</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>
          Sign in
        </button>
      </div>
    );
  } else if (role === "staff" || role === "admin") {
    content = <div className="alert alert-warning">Founder tools are for founder accounts; staff are not gated.</div>;
  } else if (role !== "founder") {
    content = (
      <div className="alert alert-warning">
        You need an approved founder application first.{" "}
        <Link href="/apply" style={{ color: "var(--brand-accent)" }}>Apply here</Link>
      </div>
    );
  } else {
    content = <FounderDashboard />;
  }
  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Founder</h1>
      {content}
    </div>
  );
}
