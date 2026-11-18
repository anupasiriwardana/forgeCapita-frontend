"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignMessage } from "wagmi";
import { UserCheck } from "lucide-react";
import { AcceptDeveloperRole } from "@/components/AcceptDeveloperRole";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { chainName } from "@/config/chains";
import { toast } from "@/lib/toast";
import { isUserRejection, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
import {
  ApiError,
  acceptTakeoverCase,
  describeFounderError,
  listMyTakeoverCases,
  type MyTakeoverCaseDto,
} from "@/lib/api";

function takeoverAcceptError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return `${err.message}. Check that your device clock is correct and try again.`;
    if (err.status === 404) return "Takeover request not found";
    if (err.status === 409) return err.message;
  }
  return describeFounderError(err, "Could not accept the takeover request");
}

function statusTone(status: string): StatusTone {
  if (status === "vote_open") return "success";
  if (status === "prepared") return "warning";
  return "neutral";
}

export function TakeoverSection() {
  const { signMessageAsync } = useSignMessage();
  const { allowed: writeAllowed } = useWriteAllowed();
  const [items, setItems] = useState<MyTakeoverCaseDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<MyTakeoverCaseDto | null>(null);
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
      })
      .finally(() => {
        if (!signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  /** Signs and submits the acceptance; errors propagate so the confirm dialog can show them (a wallet cancel only toasts). */
  async function accept(item: MyTakeoverCaseDto): Promise<void> {
    if (busyId !== null || item.acceptMessage === null) return;
    setBusyId(item.id);
    setError("");
    try {
      const issuedAt = new Date().toISOString();
      const message = item.acceptMessage.replace("{issuedAt}", () => issuedAt);
      const signature = await signMessageAsync({ message });
      await acceptTakeoverCase(item.id, { issuedAt, signature });
      toast.success("Takeover accepted", { description: "Waiting for staff to open the vote." });
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (!isUserRejection(err)) throw err;
      toast.info(WALLET_CANCELLED_MESSAGE);
    } finally {
      setBusyId(null);
    }
  }

  let body: React.ReactNode;
  if (!loaded) {
    body = (
      <Card className="fp-card" aria-busy="true">
        <span className="sr-only" role="status">Loading…</span>
        <div className="stack-md">
          <Skeleton width="40%" height={16} />
          <Skeleton width="65%" />
        </div>
      </Card>
    );
  } else if (items.length === 0 && !error) {
    body = (
      <Card>
        <EmptyState icon={<UserCheck size={20} />} title="No takeover requests." text="When staff nominate you to take over a project, the request appears here." />
      </Card>
    );
  } else {
    body = items.map((item) => (
      <Card key={item.id}>
        <CardHeader
          title={
            <Link href={`/projects/${encodeURIComponent(item.projectId)}`} className="link-accent mono" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
              {item.projectId}
            </Link>
          }
          actions={<StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>}
        />
        <CardBody className="stack-md">
          <div className="kv-list">
            <div className="kv-row"><span>Chain</span><span>{chainName(item.chainId)}</span></div>
            <div className="kv-row"><span>Candidate wallet</span><AddressChip address={item.candidateWallet} /></div>
          </div>
          {item.status === "prepared" && item.acceptMessage !== null && (
            <div>
              <Button loading={busyId === item.id} disabled={busyId !== null || !writeAllowed} onClick={() => setConfirmItem(item)}>
                {busyId === item.id ? "Waiting…" : "Accept takeover"}
              </Button>
            </div>
          )}
          {item.status === "prepared" && item.acceptMessage === null && (
            <p className="panel-note">{item.acceptedAt ? "Accepted. Waiting for staff to open the vote." : "Waiting for staff."}</p>
          )}
          {item.status === "vote_open" && (
            <p className="panel-note">{item.acceptedAt ? "Accepted. The vote is open." : "The vote is open."}</p>
          )}
          {item.status === "closed" && (
            <div className="inline-actions">
              <AcceptDeveloperRole item={item} writeAllowed={writeAllowed} />
            </div>
          )}
        </CardBody>
      </Card>
    ));
  }

  return (
    <section id="takeover" className="section-stack">
      <ProfileRequiredNotice />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {body}
      <ConfirmDialog
        open={confirmItem !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmItem(null);
        }}
        title="Accept this takeover request?"
        body="Your wallet will ask you to sign a message accepting the nomination. Staff then open the community vote; the result is advisory."
        confirmLabel="Sign and accept"
        describeError={takeoverAcceptError}
        onConfirm={async () => {
          if (confirmItem) await accept(confirmItem);
        }}
      />
    </section>
  );
}
