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
import { useAuth } from "@/components/web3/AuthProvider";

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

interface FormValues {
  name: string;
  description: string;
  founderBio: string;
  logoUrl: string;
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
  if (v.founderBio.length > 5000) return "Founder bio must be at most 5000 characters.";
  const urls: Array<[string, string]> = [
    ["Logo URL", v.logoUrl.trim()],
    ["Website URL", v.websiteUrl.trim()],
    ["Pitch deck URL", v.pitchDeckUrl.trim()],
  ];
  for (const [label, value] of urls) {
    if (value !== "" && !isHttpsUrl(value)) return `${label} must be a valid https URL (max ${MAX_URL} characters).`;
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
    founderBio: profile?.founderBio ?? "",
    logoUrl: profile?.logoUrl ?? "",
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
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!allowed || !needsWallet) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchLaunchEligibility(signal)
      .then(async (result) => {
        const me = result.eligible ? await fetchFounderMe(signal) : null;
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
        if (!(err instanceof ApiError)) throw err;
        if (err.status !== 404) throw new Error(describeFounderError(err));
        if (attempt >= MAX_ATTEMPTS) {
          setSaveNote("");
          throw new Error("Project not indexed yet; try again shortly");
        }
        setSaveNote(`Waiting for indexer (${attempt}/${MAX_ATTEMPTS})`);
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
      founderBio: values.founderBio,
      logoUrl: values.logoUrl.trim(),
      websiteUrl: values.websiteUrl.trim(),
      pitchDeckUrl: values.pitchDeckUrl.trim(),
      category: values.category.trim(),
      ...(needsWallet ? { shadowWalletId } : {}),
    };

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await saveWithRetry(input);
      setSuccessMsg("Profile saved.");
      await queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Profile save failed.");
    } finally {
      setSaving(false);
    }
  }

  const walletBlocked =
    needsWallet && (gateError !== "" || !eligibility || !eligibility.eligible || freeWallets.length === 0);

  return (
    <div className="glass-card fade-in-up" style={{ padding: "24px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "16px", marginBottom: "12px" }}>Project profile</h2>
      {profile === null && (
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "16px" }}>
          This project has no profile yet. Save it now to finish the launch.
        </p>
      )}
      {errorMsg && <div role="alert" className="alert alert-error" style={{ marginBottom: "16px" }}>{errorMsg}</div>}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{successMsg}</div>}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <label className="label" htmlFor="pe-name">Project Name *</label>
        <input id="pe-name" className="input-field" value={values.name} maxLength={120} required onChange={(e) => setField("name", e.target.value)} />

        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="pe-description">Description *</label>
          <textarea id="pe-description" className="input-field" value={values.description} maxLength={5000} required style={{ minHeight: "90px" }} onChange={(e) => setField("description", e.target.value)} />
        </div>

        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="pe-logo">Logo URL</label>
          <input id="pe-logo" className="input-field" type="url" placeholder="https://..." value={values.logoUrl} maxLength={MAX_URL} onChange={(e) => setField("logoUrl", e.target.value)} />
        </div>
        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="pe-website">Website URL</label>
          <input id="pe-website" className="input-field" type="url" placeholder="https://..." value={values.websiteUrl} maxLength={MAX_URL} onChange={(e) => setField("websiteUrl", e.target.value)} />
        </div>
        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="pe-deck">Pitch Deck URL</label>
          <input id="pe-deck" className="input-field" type="url" placeholder="https://..." value={values.pitchDeckUrl} maxLength={MAX_URL} onChange={(e) => setField("pitchDeckUrl", e.target.value)} />
        </div>
        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="pe-category">Category</label>
          <input id="pe-category" className="input-field" placeholder="fintech" value={values.category} maxLength={32} onChange={(e) => setField("category", e.target.value)} />
        </div>
        <div style={{ marginTop: "16px" }}>
          <label className="label" htmlFor="pe-bio">Founder Bio</label>
          <textarea id="pe-bio" className="input-field" value={values.founderBio} maxLength={5000} style={{ minHeight: "70px" }} onChange={(e) => setField("founderBio", e.target.value)} />
        </div>

        {needsWallet && (
          <div style={{ marginTop: "16px" }}>
            {gateError && <div role="alert" className="alert alert-error">{gateError}</div>}
            {!gateError && !eligibility && <p style={{ color: "var(--text-secondary)" }}>Checking eligibility…</p>}
            {eligibility && !eligibility.eligible && (
              <p style={{ color: "var(--text-secondary)" }}>
                Launch requirements are not met yet. See <Link href="/founder" style={{ color: "var(--brand-accent)" }}>/founder</Link>.
              </p>
            )}
            {eligibility?.eligible && freeWallets.length === 0 && (
              <p style={{ color: "var(--text-secondary)" }}>
                No free approved wallet: request one on <Link href="/founder" style={{ color: "var(--brand-accent)" }}>/founder</Link>
              </p>
            )}
            {eligibility?.eligible && freeWallets.length > 0 && (
              <>
                <label className="label" htmlFor="pe-wallet">Shadow wallet *</label>
                <select id="pe-wallet" className="input-field" value={shadowWalletId} onChange={(e) => setShadowWalletId(e.target.value)}>
                  <option value="">Select a wallet</option>
                  {freeWallets.map((w) => (
                    <option key={w.id} value={w.id}>{shortAddr(w.address)}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        <button type="submit" className="btn-primary" style={{ marginTop: "20px" }} disabled={saving || walletBlocked}>
          {saving ? (saveNote || "Saving Profile...") : profile === null ? "Save profile" : "Update profile"}
        </button>
      </form>
    </div>
  );
}
