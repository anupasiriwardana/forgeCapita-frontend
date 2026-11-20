"use client";

import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast, toastErrorWithRef } from "@/lib/toast";
import { isUserRejection, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
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
      toast.success("Agreement accepted");
      onChanged();
    } catch (err) {
      let message: string | null = null;
      if (isUserRejection(err)) toast.info(WALLET_CANCELLED_MESSAGE);
      else if (err instanceof ApiError && err.status === 409) onChanged();
      else if (err instanceof ApiError && err.status === 400 && /time window/i.test(err.message)) {
        message = "Check your computer clock and try again";
      } else message = describeFounderError(err, "Could not accept the agreement");
      if (message) {
        setError(message);
        toastErrorWithRef(message, err);
      }
    } finally {
      setBusy(false);
    }
  }

  if (accepted) {
    return (
      <section id="agreement">
        <InlineAlert tone="success" title="Agreement accepted">
          Accepted v{accepted.version} on {new Date(accepted.acceptedAt).toLocaleString()}
        </InlineAlert>
      </section>
    );
  }

  return (
    <section id="agreement">
      <Card>
        <CardHeader
          title={
            <span className="panel-title">
              <FileSignature size={16} aria-hidden="true" />
              Agreement text
            </span>
          }
        />
        <CardBody>
          {text === null ? (
            <div className="stack-sm" role="status">
              <span className="sr-only">Loading…</span>
              <Skeleton width="90%" />
              <Skeleton width="80%" />
              <Skeleton width="85%" />
              <Skeleton width="60%" />
            </div>
          ) : (
            <pre className="prose-scroll" tabIndex={0} aria-label="Agreement text">
              {text}
            </pre>
          )}
        </CardBody>
        <CardFooter style={{ display: "block", padding: "16px 20px" }}>
          <div className="stack-md content-narrow">
            <Field
              label="Type your full legal name"
              id="typedName"
              hint={`At least ${MIN_NAME} characters. Your wallet will ask you to sign the agreement.`}
            >
              <Input value={name} maxLength={MAX_NAME} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </Field>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div>
              <Button loading={busy} disabled={trimmed.length < MIN_NAME || text === null} onClick={() => void submit()}>
                {busy ? "Waiting…" : "Sign and accept"}
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    </section>
  );
}
