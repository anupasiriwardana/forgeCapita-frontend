"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  ApiError,
  describeApiError,
  getMyProfile,
  saveMyProfile,
  type UserProfileDto,
  type UserProfileInput,
} from "@/lib/api";
import { countryOptions } from "@/lib/countries";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  dateOfBirth: string;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  dateOfBirth: "",
};

const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_AGE = 18;

function fromDto(dto: UserProfileDto): FormState {
  return {
    ...dto,
    addressLine2: dto.addressLine2 ?? "",
    region: dto.region ?? "",
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function maxBirthDate(): string {
  const d = new Date();
  return `${d.getFullYear() - MIN_AGE}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Client hints mirror the server schema; the server is authoritative. */
function hints(f: FormState, maxDob: string): string[] {
  const out: string[] = [];
  const len = (v: string, max: number): boolean => v.trim().length >= 1 && v.trim().length <= max;
  if (!len(f.firstName, 80) || !len(f.lastName, 80)) out.push("Enter your first and last name (up to 80 characters each).");
  if (!EMAIL_REGEX.test(f.email.trim()) || f.email.trim().length > 254) out.push("Enter a valid email address.");
  if (!PHONE_REGEX.test(f.phone.trim())) out.push("Phone: 7-20 characters, digits, spaces, + ( ) - only.");
  if (!len(f.addressLine1, 120) || f.addressLine2.trim().length > 120) out.push("Address line 1 is required (up to 120 characters).");
  if (!len(f.city, 80) || f.region.trim().length > 80) out.push("City is required (up to 80 characters).");
  if (!len(f.postalCode, 20)) out.push("Postal code is required (up to 20 characters).");
  if (f.country.length !== 2) out.push("Select a country.");
  if (!f.dateOfBirth || f.dateOfBirth > maxDob) out.push("You must be 18 or older.");
  return out;
}

function toInput(f: FormState): UserProfileInput {
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    email: f.email.trim(),
    phone: f.phone.trim(),
    addressLine1: f.addressLine1.trim(),
    addressLine2: f.addressLine2.trim(),
    city: f.city.trim(),
    region: f.region.trim(),
    postalCode: f.postalCode.trim(),
    country: f.country,
    dateOfBirth: f.dateOfBirth,
  };
}

interface FieldOptions {
  max: number;
  type?: string;
  auto?: string;
  required?: boolean;
  help?: string;
}

/** Personal profile form. PII lives in component state only; remount (key) per wallet to clear it. */
export function UserProfileForm({ next }: { next: string }) {
  const router = useRouter();
  const { signIn, refreshSession } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const countries = useMemo(() => countryOptions(), []);
  const maxDob = useMemo(() => maxBirthDate(), []);

  useEffect(() => {
    const controller = new AbortController();
    getMyProfile(controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.profile) setForm(fromDto(res.profile));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) setNeedsSignIn(true);
        else setLoadError(describeApiError(err, "Could not load your profile"));
        setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const set = (key: keyof FormState) => (e: { target: { value: string } }): void => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const problems = hints(form, maxDob);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (saving || problems.length > 0) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await saveMyProfile(toInput(form));
      setSaved(true);
      await refreshSession();
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsSignIn(true);
      else setError(describeApiError(err, "Could not save your profile"));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;

  if (needsSignIn) {
    return (
      <div className="alert alert-warning">
        <span>Sign in to complete your profile</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>Sign in</button>
      </div>
    );
  }

  const field = (id: keyof FormState, label: string, opts: FieldOptions) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input-field"
        type={opts.type ?? "text"}
        maxLength={opts.max}
        autoComplete={opts.auto}
        required={opts.required ?? true}
        value={form[id]}
        onChange={set(id)}
      />
      {opts.help && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{opts.help}</div>}
    </div>
  );

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="glass-card" style={{ padding: "24px", display: "grid", gap: "16px" }}>
      {loadError && <div role="alert" className="alert alert-error">{loadError}</div>}
      {field("firstName", "First name", { max: 80, auto: "given-name" })}
      {field("lastName", "Last name", { max: 80, auto: "family-name" })}
      {field("email", "Email", { max: 254, type: "email", auto: "email", help: "Email is a contact address only; it is not verified." })}
      {field("phone", "Phone", { max: 20, type: "tel", auto: "tel" })}
      {field("addressLine1", "Address line 1", { max: 120, auto: "address-line1" })}
      {field("addressLine2", "Address line 2 (optional)", { max: 120, auto: "address-line2", required: false })}
      {field("city", "City", { max: 80, auto: "address-level2" })}
      {field("region", "State / region (optional)", { max: 80, auto: "address-level1", required: false })}
      {field("postalCode", "Postal code", { max: 20, auto: "postal-code" })}
      <div>
        <label className="label" htmlFor="country">Country</label>
        <select id="country" className="input-field" required autoComplete="country" value={form.country} onChange={set("country")}>
          <option value="">Select a country</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="dateOfBirth">Date of birth</label>
        <input
          id="dateOfBirth"
          className="input-field"
          type="date"
          required
          autoComplete="bday"
          min="1900-01-02"
          max={maxDob}
          value={form.dateOfBirth}
          onChange={set("dateOfBirth")}
        />
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>You must be 18 or older</div>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {saved && !error && <div role="status" className="alert alert-success">Profile saved.</div>}
      <button type="submit" className="btn-primary" disabled={saving || problems.length > 0} title={problems[0]}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
