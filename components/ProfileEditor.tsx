"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  describeFounderError,
  fetchFounderMe,
  fetchLaunchEligibility,
  shortAddr,
  upsertProfile,
  type LaunchEligibilityDto,
  type ProfileInput,
  type ProjectDto,
  type ShadowWalletDto,
} from "@/lib/api";
import { PenLine } from "lucide-react";
import { ShadowWalletInfo } from "@/components/InfoDialog";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { toast } from "@/lib/toast";

const MAX_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4000;
const MAX_URL = 2048;
const CATEGORY_REGEX = /^[a-z0-9][a-z0-9-]{0,31}$/;

function isHttpsUrl(value: string): boolean {
  if (value.length > MAX_URL) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Wallet-selection gate; deliberately ignores the repository check. */
function walletChecksPass({ checks }: LaunchEligibilityDto): boolean {
  return checks.applicationApproved && checks.agreementAccepted && checks.shadowWalletAvailable;
}

interface FormValues {
  name: string;
  description: string;
  websiteUrl: string;
  pitchDeckUrl: string;
  category: string;
}

/** Mirrors profileBodySchema in the API; returns the first problem or an empty string. */
function validate(v: FormValues): string {
  const name = v.name.trim();
  const description = v.description.trim();
  if (name.length < 1 || name.length > 120) return "Name is required (max 120 characters).";
  if (description.length < 1 || description.length > 5000) return "Description is required (max 5000 characters).";
  const urls: Array<[string, string]> = [
    ["Website link", v.websiteUrl.trim()],
    ["Pitch deck link", v.pitchDeckUrl.trim()],
  ];
  for (const [label, value] of urls) {
    if (value !== "" && !isHttpsUrl(value)) return `${label} must be a valid https link (max ${MAX_URL} characters).`;
  }
  const category = v.category.trim();
  if (category !== "" && !CATEGORY_REGEX.test(category)) {
    return "Category must be lowercase letters, digits or hyphens (max 32 characters).";
  }
  return "";
}

export function ProfileEditor({ project }: { project: ProjectDto }) {
  const { user, role, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const profile = project.profile;
  const isFounder = role === "founder";
  const isStaff = role === "staff" || role === "admin";
  const isDeveloper = user !== null && user.address.toLowerCase() === project.developer.toLowerCase();
  const allowed = user !== null && (isDeveloper || isStaff);
  const needsWallet = isFounder && profile === null;

  const [values, setValues] = useState<FormValues>({
    name: profile?.name ?? project.tokenName ?? "",
    description: profile?.description ?? "",
    websiteUrl: profile?.websiteUrl ?? "",
    pitchDeckUrl: profile?.pitchDeckUrl ?? "",
    category: profile?.category ?? "",
  });
  const [eligibility, setEligibility] = useState<LaunchEligibilityDto | null>(null);
  const [freeWallets, setFreeWallets] = useState<ShadowWalletDto[]>([]);
  const [shadowWalletId, setShadowWalletId] = useState("");
  const [gateError, setGateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!allowed || !needsWallet) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchLaunchEligibility(signal)
      .then(async (result) => {
        const me = walletChecksPass(result) ? await fetchFounderMe(signal) : null;
        if (signal.aborted) return;
        setEligibility(result);
        setFreeWallets(me ? me.wallets.filter((w) => w.status === "approved" && w.projectId === null) : []);
        setGateError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setGateError(describeFounderError(err, "Could not check launch eligibility"));
      });
    return () => controller.abort();
  }, [allowed, needsWallet]);

  if (authLoading && !user) return null;
  if (!allowed) return null;

  function setField(key: keyof FormValues, value: string): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function saveWithRetry(input: ProfileInput): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await upsertProfile(input);
        setSaveNote("");
        return;
      } catch (err) {
        // Only safe, mapped messages leave this function; raw errors never reach the UI.
        if (!(err instanceof ApiError)) throw new Error("Profile save failed.");
        if (err.status !== 404) throw new Error(describeFounderError(err));
        if (attempt >= MAX_ATTEMPTS) {
          setSaveNote("");
          throw new Error("Your project is not ready yet. Try again shortly.");
        }
        setSaveNote(`Waiting for your project to appear (${attempt}/${MAX_ATTEMPTS})`);
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (saving) return;
    const problem = validate(values);
    if (problem) { setErrorMsg(problem); return; }
    if (needsWallet && shadowWalletId === "") { setErrorMsg("Select a shadow wallet."); return; }

    const input: ProfileInput = {
      projectId: project.id,
      name: values.name.trim(),
      description: values.description.trim(),
      websiteUrl: values.websiteUrl.trim(),
      pitchDeckUrl: values.pitchDeckUrl.trim(),
      category: values.category.trim(),
      ...(needsWallet ? { shadowWalletId } : {}),
    };

    setSaving(true);
    setErrorMsg("");
    try {
      await saveWithRetry(input);
      toast.success("Profile saved.");
      await queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Profile save failed.");
    } finally {
      setSaving(false);
    }
  }

  const walletChecksOk = eligibility !== null && walletChecksPass(eligibility);
  const walletBlocked = needsWallet && (gateError !== "" || !walletChecksOk || freeWallets.length === 0);

  return (
    <Card>
      <CardHeader
        title={
          <span className="panel-title">
            <PenLine size={16} aria-hidden="true" />
            Project profile
          </span>
        }
        subtitle={profile === null ? "This project has no profile yet. Save it now to finish the launch." : undefined}
      />
      <CardBody>
        <form onSubmit={(e) => void handleSubmit(e)} className="form-grid">
          {errorMsg && <InlineAlert tone="danger">{errorMsg}</InlineAlert>}
          <Field label="Project name" required id="pe-name">
            <Input value={values.name} maxLength={120} required onChange={(e) => setField("name", e.target.value)} />
          </Field>
          <Field label="Description" required id="pe-description">
            <Textarea value={values.description} maxLength={5000} required style={{ minHeight: "90px" }} onChange={(e) => setField("description", e.target.value)} />
          </Field>
          <div className="form-grid form-grid-2">
            <Field label="Website link" id="pe-website">
              <Input type="url" placeholder="https://..." value={values.websiteUrl} maxLength={MAX_URL} onChange={(e) => setField("websiteUrl", e.target.value)} />
            </Field>
            <Field label="Pitch deck link" id="pe-deck">
              <Input type="url" placeholder="https://..." value={values.pitchDeckUrl} maxLength={MAX_URL} onChange={(e) => setField("pitchDeckUrl", e.target.value)} />
            </Field>
          </div>
          <Field label="Category" id="pe-category" hint="Lowercase letters, digits or hyphens.">
            <Input placeholder="fintech" value={values.category} maxLength={32} onChange={(e) => setField("category", e.target.value)} />
          </Field>

          {needsWallet && (
            <div className="stack-sm">
              {gateError && <InlineAlert tone="danger">{gateError}</InlineAlert>}
              {!gateError && !eligibility && <p className="panel-note" role="status">Checking your launch requirements...</p>}
              {eligibility && !walletChecksOk && (
                <InlineAlert tone="warning">
                  Launch requirements are not met yet. See your <Link href="/founder/projects" className="link-accent">founder requirements</Link>.
                </InlineAlert>
              )}
              {walletChecksOk && freeWallets.length === 0 && (
                <InlineAlert tone="warning">
                  You have no free shadow wallet. Request one on the <Link href="/founder/wallets" className="link-accent">shadow wallets page</Link>.
                </InlineAlert>
              )}
              {walletChecksOk && freeWallets.length > 0 && (
                <div>
                  <div className="label-row">
                    <label className="label" htmlFor="pe-wallet">Shadow wallet *</label>
                    <ShadowWalletInfo />
                  </div>
                  <Select id="pe-wallet" value={shadowWalletId} onChange={(e) => setShadowWalletId(e.target.value)}>
                    <option value="">Select a wallet</option>
                    {freeWallets.map((w) => (
                      <option key={w.id} value={w.id}>{shortAddr(w.address)}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}

          <div>
            <Button type="submit" loading={saving} disabled={walletBlocked}>
              {saving ? (saveNote || "Saving...") : profile === null ? "Save profile" : "Update profile"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
