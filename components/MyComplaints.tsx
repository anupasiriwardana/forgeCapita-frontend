"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS } from "@/components/ComplaintDialog";
import { useAuth } from "@/components/web3/AuthProvider";
import { describeApiError, listMyComplaints, shortAddr, type ComplaintDto, type ComplaintStatus } from "@/lib/api";
import { chainName } from "@/config/chains";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";

function complaintTone(status: ComplaintStatus): StatusTone {
  if (status === "RESOLVED") return "success";
  if (status === "INVESTIGATING") return "warning";
  if (status === "DISMISSED") return "neutral";
  return "accent";
}

/** Signed-in only list of the caller's own complaints, including the review team's response. */
export function MyComplaints() {
  const { user } = useAuth();
  const [items, setItems] = useState<ComplaintDto[] | null>(null);
  const [error, setError] = useState("");
  const signedIn = user !== null;

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    const { signal } = controller;
    listMyComplaints(signal)
      .then((list) => {
        if (!signal.aborted) setItems(list);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(describeApiError(err, "Failed to load complaints"));
      });
    return () => controller.abort();
  }, [signedIn]);

  if (!signedIn) return null;

  const columns: ReadonlyArray<DataTableColumn<ComplaintDto>> = [
    { key: "category", header: "Category", cell: (c) => <span style={{ fontWeight: 600 }}>{CATEGORY_LABELS[c.category]}</span> },
    { key: "status", header: "Status", cell: (c) => <StatusPill tone={complaintTone(c.status)}>{c.status}</StatusPill> },
    {
      key: "project",
      header: "Project",
      cell: (c) => (
        <div>
          <Link href={`/projects/${encodeURIComponent(c.projectId)}`} className="cell-title mono" style={{ fontSize: 13 }}>
            {shortAddr(c.projectId.split(":")[1] ?? c.projectId)}
          </Link>
          <div className="cell-sub">{chainName(c.chainId)}</div>
        </div>
      ),
    },
    {
      key: "filed",
      header: "Filed",
      numeric: true,
      cell: (c) => <span className="cell-sub" style={{ fontSize: 13 }}>{new Date(c.createdAt).toLocaleString()}</span>,
    },
    {
      key: "response",
      header: "Response from the review team",
      width: "36%",
      cell: (c) =>
        c.staffNote ? (
          <div style={{ fontSize: 13 }}>
            <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, color: "var(--text-2)" }}>{c.staffNote}</p>
            <div className="cell-sub num" style={{ marginTop: 4 }}>
              Status {c.status}, updated {new Date(c.updatedAt).toLocaleString()}
            </div>
          </div>
        ) : (
          <span className="cell-sub">No response yet</span>
        ),
    },
  ];

  return (
    <section aria-labelledby="complaints-heading">
      <Card>
        <CardHeader title={<span id="complaints-heading">My complaints</span>} subtitle="Only you and ForgeCapita staff can see these reports." />
        <CardBody style={{ paddingLeft: 0, paddingRight: 0, paddingBottom: 4 }}>
          {error ? (
            <div style={{ padding: "0 20px 16px" }}>
              <InlineAlert tone="danger">{error}</InlineAlert>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={items ?? []}
              rowKey={(c) => c.id}
              caption="My complaints"
              loading={items === null}
              skeletonRows={2}
              emptyTitle="No complaints filed"
              emptyText="Use Report a problem on a project page if something looks wrong."
            />
          )}
        </CardBody>
      </Card>
    </section>
  );
}
