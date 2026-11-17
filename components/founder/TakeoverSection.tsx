"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignMessage } from "wagmi";
import { AcceptDeveloperRole } from "@/components/AcceptDeveloperRole";
import { isUserRejection } from "@/components/founder/isUserRejection";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import {
  ApiError,
  acceptTakeoverCase,
  describeFounderError,
  listMyTakeoverCases,
  type MyTakeoverCaseDto,
} from "@/lib/api";

function takeoverAcceptError(err: unknown): string {
  if (isUserRejection(err)) return "Signature cancelled";
  if (err instanceof ApiError) {
    if (err.status === 400) return `${err.message}. Check that your device clock is correct and try again.`;
    if (err.status === 404) return "Takeover request not found";
    if (err.status === 409) return err.message;
  }
  return describeFounderError(err, "Could not accept the takeover request");
}

export function TakeoverSection() {
  const { signMessageAsync } = useSignMessage();
  const { allowed: writeAllowed } = useWriteAllowed();
  const [items, setItems] = useState<MyTakeoverCaseDto[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    listMyTakeoverCases(signal)
      .then((list) => {
        if (!signal.aborted) setItems(list);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeFounderError(err, "Failed to load takeover requests"));
      });
    return () => controller.abort();
  }, [reloadKey]);

  async function accept(item: MyTakeoverCaseDto): Promise<void> {
    if (busyId !== null || item.acceptMessage === null) return;
    setBusyId(item.id);
    setError("");
    try {
      const issuedAt = new Date().toISOString();
      const message = item.acceptMessage.replace("{issuedAt}", () => issuedAt);
      const signature = await signMessageAsync({ message });
      await acceptTakeoverCase(item.id, { issuedAt, signature });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(takeoverAcceptError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="takeover" className="glass-card" style={{ padding: "24px" }}>
      <ProfileRequiredNotice />
      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: "12px" }}>{error}</div>}
      {items.length === 0 && !error && <p style={{ color: "var(--text-secondary)" }}>No takeover requests.</p>}
      {items.map((item) => (
        <div
          key={item.id}
          style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "14px" }}
        >
          <Link href={`/projects/${encodeURIComponent(item.projectId)}`} style={{ color: "var(--brand-accent)" }}>
            {item.projectId}
          </Link>
          <span className={`badge ${item.status === "vote_open" ? "badge-active" : item.status === "prepared" ? "badge-pending" : "badge-inactive"}`}>
            {item.status}
          </span>
          {item.status === "prepared" && item.acceptMessage !== null && (
            <button
              type="button"
              className="btn-primary"
              disabled={busyId !== null || !writeAllowed}
              onClick={() => void accept(item)}
            >
              {busyId === item.id ? "Waiting…" : "Accept takeover"}
            </button>
          )}
          {item.status === "prepared" && item.acceptMessage === null && (
            <span style={{ color: "var(--text-secondary)" }}>
              {item.acceptedAt ? "Accepted. Waiting for staff to open the vote." : "Waiting for staff."}
            </span>
          )}
          {item.status === "vote_open" && (
            <span style={{ color: "var(--text-secondary)" }}>
              {item.acceptedAt ? "Accepted. The vote is open." : "The vote is open."}
            </span>
          )}
          {item.status === "closed" && <AcceptDeveloperRole item={item} writeAllowed={writeAllowed} />}
        </div>
      ))}
    </section>
  );
}
