"use client";

import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { FounderProjects } from "@/components/FounderProjects";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { StatusPill } from "@/components/ui/StatusPill";
import { describeFounderError, fetchLaunchEligibility, type LaunchEligibilityDto } from "@/lib/api";

interface CheckProps {
  ok: boolean;
  label: string;
  help: string;
  href: string;
  action: string;
}

function Check({ ok, label, help, href, action }: CheckProps) {
  return (
    <li className="check-row">
      <StatusIcon state={ok ? "done" : "error"} label={ok ? "Done" : "Not done"} />
      <div className="check-row-main">
        <div className="check-row-title">{label}</div>
        <div className="check-row-help">{help}</div>
      </div>
      {!ok && (
        <ButtonLink href={href} variant="secondary" size="sm">
          {action}
        </ButtonLink>
      )}
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
    checklist = <InlineAlert tone="danger">{error}</InlineAlert>;
  } else if (!eligibility) {
    checklist = (
      <Card aria-busy="true">
        <CardBody className="stack-md">
          <span className="sr-only" role="status">Loading…</span>
          <Skeleton width="40%" height={16} />
          <Skeleton height={6} />
          <Skeleton width="70%" />
          <Skeleton width="60%" />
        </CardBody>
      </Card>
    );
  } else {
    const { checks } = eligibility;
    const doneCount = [checks.applicationApproved, checks.agreementAccepted, checks.shadowWalletAvailable, checks.repoProvisioned].filter(Boolean).length;
    checklist = (
      <Card>
        <CardHeader
          title={`Launch eligibility: ${eligibility.eligible ? "ready" : "not ready"}`}
          subtitle="Complete all four checks before you launch a project."
          actions={
            eligibility.eligible ? (
              <StatusPill tone="success">Ready</StatusPill>
            ) : (
              <StatusPill tone="warning">Not ready</StatusPill>
            )
          }
        />
        <CardBody>
          <div className="checklist-progress" style={{ marginBottom: 16 }}>
            <div
              className="progress-bar"
              role="progressbar"
              aria-label="Launch checks done"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={doneCount}
            >
              <div className="progress-fill" style={{ width: `${(doneCount * 25).toString()}%` }} />
            </div>
            <span className="checklist-count num">{doneCount} of 4 done</span>
          </div>
          <ul className="check-list">
            <Check
              ok={checks.applicationApproved}
              label="Application approved"
              help="Staff review your founder application and KYC documents."
              href="/apply"
              action="Apply"
            />
            <Check
              ok={checks.agreementAccepted}
              label="Agreement accepted"
              help="Sign the revenue share agreement with your wallet."
              href="/founder/agreement"
              action="Sign it"
            />
            <Check
              ok={checks.shadowWalletAvailable}
              label="Approved shadow wallet available"
              help="A dedicated revenue wallet, approved by staff, for one project."
              href="/founder/wallets"
              action="Request one"
            />
            <Check
              ok={checks.repoProvisioned}
              label="Project repository"
              help="A ForgeCapita-created GitHub repository for your project code."
              href="/founder/repository"
              action="Request it"
            />
          </ul>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>My projects</h1>
          <p>Your launch checklist and the projects you run as developer.</p>
        </div>
        <div className="page-title-actions">
          <ButtonLink href="/founder/launches" variant="secondary" size="sm">My launches</ButtonLink>
          <ButtonLink href="/founder/launch" size="sm" leftIcon={<Rocket size={14} aria-hidden="true" />}>Launch project</ButtonLink>
        </div>
      </div>
      <div className="section-stack">
        {checklist}
        <FounderProjects />
      </div>
    </>
  );
}
