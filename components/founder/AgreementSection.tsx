"use client";

import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { isUserRejection } from "@/components/founder/isUserRejection";
import {
  ApiError,
  acceptAgreement,
  describeFounderError,
  fetchAgreement,
  type FounderMeDto,
} from "@/lib/api";

const MIN_NAME = 2;
const MAX_NAME = 120;

export function AgreementSection({ me, onChanged }: { me: FounderMeDto; onChanged: () => void }) {
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
    <section id="agreement" className="glass-card" style={{ padding: "24px" }}>
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
