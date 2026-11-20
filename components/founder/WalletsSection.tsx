"use client";

import Link from "next/link";
import { useState } from "react";
import { ShadowWalletInfo } from "@/components/InfoDialog";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { toast } from "@/lib/toast";
import { describeFounderError, requestShadowWallet, shortAddr, type FounderMeDto, type ShadowWalletDto } from "@/lib/api";
import { chainName } from "@/config/chains";

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function statusTone(status: string): StatusTone {
  return status === "approved" ? "success" : status === "pending" ? "warning" : "neutral";
}

/** "Arbitrum Sepolia 0x1234...abcd" for a "chainId:escrow" project id; the full id goes in the title. */
function shortProjectLabel(projectId: string): string {
  const [chain = "", escrow = ""] = projectId.split(":");
  const chainId = Number(chain);
  if (!Number.isInteger(chainId) || !escrow) return shortAddr(projectId);
  return `${chainName(chainId)} ${shortAddr(escrow)}`;
}

function WalletUse({ w }: { w: ShadowWalletDto }) {
  if (w.projectId) {
    return (
      <span>
        {w.reserved ? "Project" : "Bound to project"}{" "}
        <Link
          href={`/projects/${encodeURIComponent(w.projectId)}`}
          className="link-accent"
          title={w.projectId}
          style={{ fontSize: 12, whiteSpace: "nowrap" }}
        >
          {shortProjectLabel(w.projectId)}
        </Link>
      </span>
    );
  }
  if (w.status === "approved" && !w.reserved) return <span className="cell-sub" style={{ fontSize: 13 }}>Unused</span>;
  return null;
}

const COLUMNS: ReadonlyArray<DataTableColumn<ShadowWalletDto>> = [
  { key: "address", header: "Address", cell: (w) => <AddressChip address={w.address} /> },
  {
    key: "status",
    header: "Status",
    cell: (w) => (
      <div className="inline-actions">
        <StatusPill tone={statusTone(w.status)}>{w.status}</StatusPill>
        {w.reserved && <StatusPill tone="warning">Reserved (launch pending)</StatusPill>}
      </div>
    ),
  },
  { key: "note", header: "Reviewer note", cell: (w) => (w.reviewNote ? <span className="cell-sub" style={{ fontSize: 13 }}>{w.reviewNote}</span> : null) },
  { key: "use", header: "Project", cell: (w) => <WalletUse w={w} /> },
];

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
      toast.success("Shadow wallet requested", { description: "Staff will review the address." });
      onChanged();
    } catch (err) {
      const message = describeFounderError(err, "Could not submit the request");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const invalid = trimmed !== "" && !valid;

  return (
    <section id="wallets" className="section-stack">
      <Card>
        <CardHeader title="Your shadow wallets" subtitle="Each approved wallet can be bound to one project." />
        <CardBody style={{ paddingLeft: 0, paddingRight: 0, paddingBottom: 4 }}>
          <DataTable
            columns={COLUMNS}
            rows={me.wallets}
            rowKey={(w) => w.id}
            caption="Your shadow wallets"
            emptyTitle="No shadow wallets yet."
            emptyText="Request one below. Staff review every address before it can be used."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Request a shadow wallet" />
        <CardBody className="stack-md content-narrow">
          <div>
            <div className="label-row">
              <label className="label" htmlFor="shadowAddress">Request a shadow wallet address</label>
              <ShadowWalletInfo />
            </div>
            <p id="shadowAddress-hint" className="panel-note panel-gap">
              Use a dedicated wallet for one project&apos;s revenue (the payment processor settles into it). Do not use your
              login or personal wallet. Each wallet can be bound to only one project.
            </p>
            <Input
              id="shadowAddress"
              className="mono"
              placeholder="0x…"
              value={value}
              maxLength={42}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "shadowAddress-hint shadowAddress-error" : "shadowAddress-hint"}
              onChange={(e) => setValue(e.target.value)}
            />
            {invalid && (
              <p id="shadowAddress-error" className="field-error" role="alert">
                Enter a 0x address with 40 hex characters
              </p>
            )}
          </div>
          {hasPending && <InlineAlert tone="info">A request is already pending review.</InlineAlert>}
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div>
            <Button loading={busy} disabled={!valid || hasPending} onClick={() => void submit()}>
              Request
            </Button>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
