"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ClipboardCheck, Coins, FileText, ListChecks, Plus, Rocket, X } from "lucide-react";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";
import { useWriteContract, useAccount, useChainId, usePublicClient } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { useRouter } from "next/navigation";
import { chainCurrency, chainName } from "@/config/chains";
import {
  ApiError,
  attachLaunchDraft,
  cancelLaunchDraft,
  createLaunchDraft,
  describeFounderError,
  fetchFounderMe,
  formatEthCeil,
  fetchLaunchEligibility,
  fetchOwnRepos,
  shortAddr,
  type LaunchDraftDto,
  type LaunchEligibilityDto,
  type OwnRepoDto,
  type ShadowWalletDto,
} from "@/lib/api";
import { ABIS, getContractConfig } from "@/lib/contracts";
import { useAuth } from "@/components/web3/AuthProvider";
import { getFeeOverrides } from "@/lib/fees";
import { explorerTxUrl } from "@/lib/explorer";
import { InfoDialog, ShadowWalletInfo } from "@/components/InfoDialog";
import { useMinimumGoal } from "@/lib/useMinimumGoal";
import { MinimumGoalPanel, liveMinimumWei } from "@/components/MinimumGoalPanel";

const ATTACH_MAX_ATTEMPTS = 4;
const ATTACH_RETRY_DELAY_MS = 3000;
const SUCCESS_REDIRECT_MS = 4000;
const DAY_MS = 86_400_000;
const DEFAULT_SUPPLY = "1000000";
const DEFAULT_DAYS = "30";
const DEFAULT_MILESTONES: MilestoneRow[] = [
  { description: "MVP Development", percentage: "30" },
  { description: "Beta Launch", percentage: "40" },
  { description: "Growth Phase", percentage: "30" },
];

const DASH = "—";

function subscribeNever(): () => void {
  return () => undefined;
}

/** Funding end date for a whole number of days (1-365), or null when the input is not valid. */
function fundingEndLabel(nowMs: number, daysText: string): string | null {
  const days = Number(daysText);
  if (daysText.trim() === "" || !Number.isInteger(days) || days < 1 || days > 365) return null;
  return new Date(nowMs + days * DAY_MS).toLocaleDateString(undefined, { dateStyle: "long" });
}

function parseGoalWei(eth: string): bigint | null {
  if (eth === "") return null;
  try {
    return parseEther(eth);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface MilestoneRow {
  description: string;
  percentage: string;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [totalSupply, setTotalSupply] = useState(DEFAULT_SUPPLY);
  const [description, setDescription] = useState("");
  const [pitchDeckUrl, setPitchDeckUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [fundingGoalEth, setFundingGoalEth] = useState("");
  const [fundingDays, setFundingDays] = useState(DEFAULT_DAYS);
  const [milestones, setMilestones] = useState<MilestoneRow[]>(DEFAULT_MILESTONES);

  const [status, setStatus] = useState<"idle" | "drafting" | "submitting" | "waiting" | "attaching" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [launchedOpen, setLaunchedOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SUCCESS_REDIRECT_MS / 1000);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const redirectedRef = useRef(false);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [nowMs] = useState(() => Date.now());
  const { user, role, loading: authLoading } = useAuth();
  const [eligibility, setEligibility] = useState<LaunchEligibilityDto | null>(null);
  const [freeWallets, setFreeWallets] = useState<ShadowWalletDto[]>([]);
  const [shadowWalletId, setShadowWalletId] = useState("");
  const [selectableRepos, setSelectableRepos] = useState<OwnRepoDto[]>([]);
  const [repoId, setRepoId] = useState("");
  const [gateError, setGateError] = useState("");
  const isFounder = role === "founder";

  function freeWalletsOf(wallets: ShadowWalletDto[]): ShadowWalletDto[] {
    return wallets.filter((w) => w.status === "approved" && w.projectId === null && !w.reserved);
  }

  function selectableReposOf(repos: OwnRepoDto[]): OwnRepoDto[] {
    return repos.filter((r) => (r.status === "invited" || r.status === "active") && r.projectId === null && !r.reserved);
  }

  async function refreshWallets(): Promise<void> {
    if (!isFounder) return;
    try {
      const me = await fetchFounderMe();
      setFreeWallets(freeWalletsOf(me.wallets));
    } catch (err) {
      setGateError(describeFounderError(err, "Could not refresh shadow wallets"));
    }
  }

  useEffect(() => {
    if (!isFounder) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchLaunchEligibility(signal)
      .then(async (result) => {
        const [me, repos] = result.eligible
          ? await Promise.all([fetchFounderMe(signal), fetchOwnRepos(signal)])
          : [null, []];
        if (signal.aborted) return;
        const selectable = selectableReposOf(repos);
        setEligibility(result);
        setFreeWallets(me ? freeWalletsOf(me.wallets) : []);
        setSelectableRepos(selectable);
        setRepoId(selectable.length === 1 ? (selectable[0]?.id ?? "") : "");
        setGateError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setGateError(describeFounderError(err, "Could not check launch eligibility"));
      });
    return () => controller.abort();
  }, [isFounder]);

  const authPending = authLoading && !user;
  const roleAllowed = user !== null && (isFounder || role === "staff" || role === "admin");
  const roleBlocked = !authPending && !roleAllowed;
  const founderBlocked =
    authPending ||
    roleBlocked ||
    (isFounder && (!eligibility || !eligibility.eligible || shadowWalletId === "" || repoId === "" || gateError !== ""));

  const { writeContractAsync } = useWriteContract();

  const goToLaunches = useCallback((): void => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.push("/founder/launches");
  }, [router]);

  useEffect(() => {
    if (!launchedOpen) return;
    const redirectTimer = setTimeout(goToLaunches, SUCCESS_REDIRECT_MS);
    const countdown = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearTimeout(redirectTimer);
      clearInterval(countdown);
    };
  }, [launchedOpen, goToLaunches]);

  const minimumGoal = useMinimumGoal(chainId);
  const enteredGoalWei = parseGoalWei(fundingGoalEth);
  const liveMinWei = liveMinimumWei(minimumGoal.data);
  const belowMinimum = liveMinWei !== null && enteredGoalWei !== null && enteredGoalWei < liveMinWei;

  const totalPct = milestones.reduce((s, m) => s + Number(m.percentage || 0), 0);

  function addMilestone() {
    setMilestones((prev) => [...prev, { description: "", percentage: "" }]);
  }

  function removeMilestone(i: number) {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateMilestone(i: number, field: keyof MilestoneRow, value: string) {
    setMilestones((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  async function cancelDraftQuietly(draft: LaunchDraftDto): Promise<void> {
    try {
      await cancelLaunchDraft(draft.id);
    } catch {
      // Best effort: an unattached draft expires on its own after 2 hours.
    }
  }

  async function attachWithRetry(draftId: string, escrow: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await attachLaunchDraft(draftId, escrow);
        return;
      } catch (err) {
        const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
        if (!retryable || attempt >= ATTACH_MAX_ATTEMPTS) throw err;
        await sleep(ATTACH_RETRY_DELAY_MS);
      }
    }
  }

  function resetForm(): void {
    setName("");
    setSymbol("");
    setTotalSupply(DEFAULT_SUPPLY);
    setDescription("");
    setPitchDeckUrl("");
    setWebsiteUrl("");
    setFundingGoalEth("");
    setFundingDays(DEFAULT_DAYS);
    setMilestones(DEFAULT_MILESTONES);
    setShadowWalletId("");
    setRepoId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;
    if (!isConnected) { setErrorMsg("Please connect your wallet first."); return; }
    if (roleBlocked) { setErrorMsg("Only approved founders can launch projects."); return; }
    if (founderBlocked) { setErrorMsg("Complete the launch requirements and choose a shadow wallet and repository first."); return; }
    if (totalPct !== 100) { setErrorMsg("Milestone percentages must add up to 100%."); return; }
    if (!name || !description || !fundingGoalEth) { setErrorMsg("Project name, description and fund goal are required."); return; }

    if (belowMinimum && liveMinWei !== null) {
      setErrorMsg(`Your fund goal is below the minimum of ${formatEthCeil(liveMinWei.toString(), 6)} ${chainCurrency(chainId)}.`);
      return;
    }

    const factory = getContractConfig(chainId, "factory");
    if (!factory) { setErrorMsg("This network is not supported. Switch to Arbitrum Sepolia or BSC Testnet in your wallet."); return; }
    if (!publicClient) { setErrorMsg("Could not connect to the network. Try again."); return; }

    setStatus("drafting");
    setErrorMsg("");

    // Step 1: save the project details and reserve the shadow wallet before asking for confirmation.
    let draft: LaunchDraftDto;
    try {
      draft = await createLaunchDraft({
        chainId,
        name,
        description,
        websiteUrl,
        pitchDeckUrl,
        ...(enteredGoalWei !== null ? { fundingGoalWei: enteredGoalWei.toString() } : {}),
        ...(isFounder ? { shadowWalletId, repoId } : {}),
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(describeFounderError(err, "Could not save your project details"));
      return;
    }

    // Step 2: the founder confirms in the wallet.
    setStatus("submitting");
    let hash: `0x${string}`;
    try {
      hash = await writeContractAsync({
        address: factory.address,
        abi: factory.abi,
        functionName: "launchProject",
        args: [
          name,
          symbol || name.slice(0, 4).toUpperCase(),
          BigInt(totalSupply),
          milestones.map((m) => m.description),
          milestones.map((m) => BigInt(m.percentage)),
          parseEther(fundingGoalEth),
          BigInt(fundingDays),
        ],
        ...(await getFeeOverrides(publicClient)),
      });
    } catch {
      await cancelDraftQuietly(draft);
      await refreshWallets();
      setStatus("error");
      setErrorMsg("The request was not confirmed in your wallet. Nothing was created.");
      return;
    }

    setStatus("waiting");
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash });
    } catch {
      setStatus("error");
      setErrorMsg(`Your confirmation was sent but is not finished yet. Check your launches in a minute. Reference: ${hash}`);
      return;
    }
    if (receipt.status !== "success") {
      await cancelDraftQuietly(draft);
      await refreshWallets();
      setStatus("error");
      setErrorMsg("The launch did not go through. No project was created.");
      return;
    }

    const [launched] = parseEventLogs({
      abi: ABIS.factory,
      eventName: "ProjectLaunched",
      logs: receipt.logs,
    });
    if (!launched) {
      setStatus("error");
      setErrorMsg(`Your project was created but we could not read it back. Keep this reference and contact support: ${hash}`);
      return;
    }
    const escrow = launched.args.milestoneEscrow;

    // Step 3: link the saved details to the new project; the API applies them automatically.
    setStatus("attaching");
    try {
      await attachWithRetry(draft.id, escrow);
    } catch {
      setStatus("error");
      setErrorMsg(
        "Your project was created but we could not link your saved details. Do not launch again. Open the project page to add them.",
      );
      return;
    }

    // The project exists once linking succeeds; the launches page does not wait for indexing.
    setStatus("done");
    setReceiptUrl(explorerTxUrl(chainId, hash));
    resetForm();
    setSecondsLeft(SUCCESS_REDIRECT_MS / 1000);
    setLaunchedOpen(true);
  }

  const isLoading = status !== "idle" && status !== "done" && status !== "error";
  const isBusy = isLoading || status === "done";
  const fundingEnd = mounted ? fundingEndLabel(nowMs, fundingDays) : null;
  const submitBlockReason = isBusy
    ? ""
    : !isConnected
      ? "Connect your wallet to launch."
      : founderBlocked
        ? "Complete the launch requirements above first."
        : belowMinimum
          ? "Your fund goal is below the minimum."
          : totalPct !== 100
            ? "Milestone percentages must add up to 100%."
            : "";

  const stepStates = [
    { step: 1, label: "Save details", done: ["submitting", "waiting", "attaching", "done"].includes(status) },
    { step: 2, label: "Confirm in wallet", done: ["attaching", "done"].includes(status) },
    { step: 3, label: "Create project", done: status === "done" },
  ];

  const currency = chainCurrency(chainId);
  const detailsDone = name !== "" && description !== "";
  const goalDone = enteredGoalWei !== null && enteredGoalWei > BigInt(0) && !belowMinimum;
  const milestonesDone = totalPct === 100;
  const sectionSteps = [
    ...(isFounder ? [{ id: "launch-requirements", label: "Requirements", done: !founderBlocked }] : []),
    { id: "launch-details", label: "Project details", done: detailsDone },
    { id: "launch-goal", label: "Fund goal", done: goalDone },
    { id: "launch-milestones", label: "Milestones", done: milestonesDone },
    { id: "launch-submit", label: "Launch", done: status === "done" },
  ];
  const currentSection = sectionSteps.findIndex((s) => !s.done);
  const currentTx = isLoading ? stepStates.findIndex((s) => !s.done) : -1;
  const requirementRows = eligibility
    ? [
        { key: "application", ok: eligibility.checks.applicationApproved, title: "Application approved", href: "/apply", action: "Apply", info: false },
        { key: "agreement", ok: eligibility.checks.agreementAccepted, title: "Agreement accepted", href: "/founder/agreement", action: "Sign it", info: false },
        { key: "wallet", ok: eligibility.checks.shadowWalletAvailable, title: "Approved shadow wallet", href: "/founder/wallets", action: "Request one", info: true },
        { key: "repo", ok: eligibility.checks.repoProvisioned, title: "Project code repository", href: "/founder/repository", action: "Request it", info: false },
      ]
    : [];
  const pctClass = totalPct === 100 ? "is-ok" : totalPct > 100 ? "is-over" : "is-under";

  return (
    <div className="layout-container">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">Founder tools</span>
          <h1>Launch Your Project</h1>
          <p>Set your fund goal and milestones. Investors fund your project, and you unlock the money milestone by milestone.</p>
        </div>
      </div>

      <nav aria-label="Launch steps" className="stepper-nav">
        <ol className="stepper">
          {sectionSteps.map((s, i) => {
            const current = i === currentSection;
            const stateText = s.done ? "Done" : current ? "Current" : "To do";
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`stepper-step${s.done ? " is-done" : ""}${current ? " is-current" : ""}`}
                  aria-current={current ? "step" : undefined}
                  title={`${s.label}: ${stateText}`}
                >
                  <span className="stepper-num num" aria-hidden="true">{i + 1}</span>
                  <span className="stepper-text">
                    <span className="stepper-label">{s.label}</span>
                    <span className="stepper-state">{stateText}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="launch-layout">
        <div className="launch-main">
          {errorMsg && <InlineAlert tone="danger">{errorMsg}</InlineAlert>}
          {!isConnected && <InlineAlert tone="warning">Please connect your wallet to launch a project.</InlineAlert>}

          {isFounder && (
            <Card id="launch-requirements" className="section-anchor">
              <CardHeader
                title={
                  <span className="panel-title">
                    <ClipboardCheck size={16} aria-hidden="true" />
                    Launch requirements
                  </span>
                }
              />
              <CardBody className="stack-md">
                {gateError && <InlineAlert tone="danger">{gateError}</InlineAlert>}
                {!gateError && !eligibility && (
                  <p className="gate-loading" role="status" style={{ padding: 0 }}>
                    <Spinner size={14} />
                    Checking your launch requirements...
                  </p>
                )}
                {eligibility && !eligibility.eligible && (
                  <ul className="check-list">
                    {requirementRows.map((r) => (
                      <li key={r.key} className="check-row">
                        <StatusIcon state={r.ok ? "done" : "todo"} label={r.ok ? "Done" : "Not done"} />
                        <div className="check-row-main">
                          <div className="check-row-title">
                            <span>{r.title}</span>
                            {r.info && <ShadowWalletInfo />}
                          </div>
                        </div>
                        {!r.ok && (
                          <ButtonLink href={r.href} variant="secondary" size="sm">
                            {r.action}
                          </ButtonLink>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {eligibility?.eligible && freeWallets.length === 0 && (
                  <InlineAlert tone="warning">
                    You have no free shadow wallet. Request one on the <Link href="/founder/wallets" className="link-accent">shadow wallets page</Link>.
                  </InlineAlert>
                )}
                {eligibility?.eligible && freeWallets.length > 0 && (
                  <div>
                    <div className="label-row">
                      <label className="label" htmlFor="shadowWalletId">Shadow wallet *</label>
                      <ShadowWalletInfo />
                    </div>
                    <Select
                      id="shadowWalletId"
                      aria-describedby="shadowWalletId-hint"
                      value={shadowWalletId}
                      onChange={(e) => setShadowWalletId(e.target.value)}
                    >
                      <option value="">Select a wallet</option>
                      {freeWallets.map((w) => (
                        <option key={w.id} value={w.id}>{shortAddr(w.address)}</option>
                      ))}
                    </Select>
                    <p id="shadowWalletId-hint" className="field-hint">Your project&apos;s revenue wallet. Each shadow wallet belongs to one project.</p>
                  </div>
                )}
                {eligibility?.eligible && selectableRepos.length === 0 && (
                  <InlineAlert tone="warning">
                    You need a project code repository first. Request one on the <Link href="/founder/repository" className="link-accent">repository page</Link>.
                  </InlineAlert>
                )}
                {eligibility?.eligible && selectableRepos.length === 1 && selectableRepos[0] && (
                  <div>
                    <span className="label">Project code repository *</span>
                    <label className="radio-row">
                      <input type="radio" name="repoId" checked={repoId === selectableRepos[0].id} onChange={() => setRepoId(selectableRepos[0]?.id ?? "")} />
                      <span className="mono">{selectableRepos[0].fullName}</span>
                    </label>
                  </div>
                )}
                {eligibility?.eligible && selectableRepos.length > 1 && (
                  <div>
                    <label className="label" htmlFor="repoId">Project code repository *</label>
                    <Select id="repoId" value={repoId} onChange={(e) => setRepoId(e.target.value)}>
                      <option value="">Select a repository</option>
                      {selectableRepos.map((r) => (
                        <option key={r.id} value={r.id}>{r.fullName}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <form id="launch-form" onSubmit={handleSubmit} className="launch-main">
            <Card id="launch-details" className="section-anchor">
              <CardHeader
                title={
                  <span className="panel-title">
                    <FileText size={16} aria-hidden="true" />
                    Project details
                  </span>
                }
                subtitle="This is what investors see on your project page."
              />
              <CardBody className="form-grid">
                <div className="form-grid form-grid-2">
                  <Field label="Project name" required id="projectName">
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="CloudForge AI" required />
                  </Field>
                  <Field
                    label="Share symbol (optional)"
                    id="shareSymbol"
                    hint="A short code for your shares. We make one from your name if you leave it empty."
                  >
                    <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="CGAI" maxLength={8} />
                  </Field>
                </div>
                <Field label="Description" required id="projectDescription" hint="Explain what you are building and who it is for.">
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does your startup build?" required style={{ minHeight: "90px" }} />
                </Field>
                <div className="form-grid form-grid-2">
                  <Field label="Website link (optional)" id="websiteLink">
                    <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." type="url" />
                  </Field>
                  <Field label="Pitch deck link (optional)" id="pitchDeckLink" hint="Investors see this on your project page.">
                    <Input value={pitchDeckUrl} onChange={e => setPitchDeckUrl(e.target.value)} placeholder="https://..." type="url" />
                  </Field>
                </div>
              </CardBody>
            </Card>

            <Card id="launch-goal" className="section-anchor">
              <CardHeader
                title={
                  <span className="panel-title">
                    <Coins size={16} aria-hidden="true" />
                    Fund goal settings
                  </span>
                }
              />
              <CardBody>
                <div className="form-grid form-grid-3">
                  <Field
                    label={`Fund goal (${currency})`}
                    required
                    id="fundGoal"
                    hint="How much you want to raise. ForgeCapita keeps 5% of the funds raised when funding closes."
                    error={belowMinimum ? "Your fund goal is below the minimum." : undefined}
                  >
                    <Input value={fundingGoalEth} onChange={e => setFundingGoalEth(e.target.value)} placeholder="10" type="number" step="0.001" min="0.001" required />
                  </Field>
                  <Field
                    label="Funding period (days)"
                    id="fundingPeriod"
                    hint={fundingEnd ? `Funding ends on ${fundingEnd}` : mounted ? undefined : "Enter a whole number of days from 1 to 365."}
                    error={mounted && !fundingEnd ? "Enter a whole number of days from 1 to 365." : undefined}
                  >
                    <Input value={fundingDays} onChange={e => setFundingDays(e.target.value)} placeholder="30" type="number" min="1" max="365" />
                  </Field>
                  <Field
                    label="Number of shares (tokens)"
                    id="shareCount"
                    hint="Investors receive a share of your project; this sets how many exist."
                  >
                    <Input value={totalSupply} onChange={e => setTotalSupply(e.target.value)} placeholder="1000000" type="number" min="1" />
                  </Field>
                </div>
                <MinimumGoalPanel chainId={chainId} goal={minimumGoal.data} enteredWei={enteredGoalWei} />
              </CardBody>
            </Card>

            <Card id="launch-milestones" className="section-anchor">
              <CardHeader
                title={
                  <span className="panel-title">
                    <ListChecks size={16} aria-hidden="true" />
                    Milestones
                  </span>
                }
                subtitle="Funds are released as each milestone is approved by investors. Percentages must total 100%."
                actions={
                  <>
                    <span className={`pct-total num ${pctClass}`}>{totalPct}% / 100%</span>
                    <Button variant="secondary" size="sm" onClick={addMilestone} leftIcon={<Plus size={14} aria-hidden="true" />}>
                      Add milestone
                    </Button>
                  </>
                }
              />
              <CardBody>
                <div className="milestone-list">
                  {milestones.map((m, i) => (
                    <div key={i} className="milestone-row">
                      <span className="step-num num" aria-hidden="true">{i + 1}</span>
                      <Input
                        id={`milestoneDescription${i}`}
                        aria-label={`Milestone ${i + 1} description`}
                        className="milestone-desc"
                        value={m.description}
                        onChange={e => updateMilestone(i, "description", e.target.value)}
                        placeholder={`Milestone ${i + 1} description`}
                      />
                      <div className="milestone-pct">
                        <Input
                          id={`milestonePercentage${i}`}
                          aria-label={`Milestone ${i + 1} percentage`}
                          className="num"
                          value={m.percentage}
                          onChange={e => updateMilestone(i, "percentage", e.target.value)}
                          placeholder="0"
                          type="number"
                          min="1"
                          max="100"
                        />
                        <span className="milestone-pct-unit" aria-hidden="true">%</span>
                      </div>
                      {milestones.length > 1 && (
                        <Button
                          variant="ghost"
                          className="icon-btn"
                          aria-label={`Remove milestone ${i + 1}`}
                          onClick={() => removeMilestone(i)}
                        >
                          <X size={16} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {totalPct !== 100 && <p className="field-error">Milestone percentages must add up to 100%.</p>}
              </CardBody>
            </Card>
          </form>
        </div>

        <aside className="launch-side" aria-label="Launch summary">
          <Card id="launch-submit" className="section-anchor">
            <CardHeader
              title={
                <span className="panel-title">
                  <Rocket size={16} aria-hidden="true" />
                  Summary
                </span>
              }
            />
            <CardBody className="stack-md">
              <div className="kv-list">
                <div className="kv-row"><span>Project</span><span style={{ fontWeight: 600 }}>{name || DASH}</span></div>
                <div className="kv-row"><span>Network</span><span>{chainName(chainId)}</span></div>
                <div className="kv-row"><span>Fund goal</span><span className="mono num">{fundingGoalEth ? `${fundingGoalEth} ${currency}` : DASH}</span></div>
                <div className="kv-row"><span>Funding ends</span><span className="num">{fundingEnd ?? DASH}</span></div>
                <div className="kv-row"><span>Milestones</span><span className={`num pct-total ${pctClass}`}>{milestones.length} ({totalPct}% / 100%)</span></div>
              </div>

              <div className="panel-section" style={{ marginTop: 4 }}>
                <h2 className="label">What happens when you click Launch</h2>
                <ol className="tx-step-list">
                  {stepStates.map((s, i) => {
                    const current = i === currentTx;
                    const desc = ["We save your project details.", "You confirm in your wallet.", "We create your project."][i];
                    return (
                      <li key={s.step} className={s.done ? "is-done" : current ? "is-current" : undefined}>
                        {current ? <Spinner size={14} /> : <StatusIcon state={s.done ? "done" : "todo"} size={14} />}
                        <span className="sr-only">{s.done ? "Done: " : current ? "In progress: " : "Not done: "}</span>
                        <span>{desc}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <Button
                type="submit"
                form="launch-form"
                size="lg"
                className="btn-block"
                loading={isLoading}
                disabled={isBusy || !isConnected || founderBlocked || belowMinimum}
              >
                {isLoading ? (
                  <>
                    {status === "drafting" && "Saving your details..."}
                    {status === "submitting" && "Confirm in your wallet..."}
                    {status === "waiting" && "Waiting for confirmation..."}
                    {status === "attaching" && "Setting up your project..."}
                  </>
                ) : (
                  "Launch project"
                )}
              </Button>
              {submitBlockReason && <p className="panel-note" style={{ textAlign: "center" }}>{submitBlockReason}</p>}
            </CardBody>
          </Card>
        </aside>
      </div>

      <InfoDialog
        open={launchedOpen}
        title="Project created"
        description="Your project was created. Redirecting to My launches..."
        onClose={goToLaunches}
        closeLabel="Go to my launches now"
        actions={
          receiptUrl ? (
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
              View receipt
            </a>
          ) : null
        }
      >
        <p className="num">Redirecting in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}.</p>
      </InfoDialog>
    </div>
  );
}
