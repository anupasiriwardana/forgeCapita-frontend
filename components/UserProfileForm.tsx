"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/lib/toast";
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
      toast.success("Profile saved.");
      await refreshSession();
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsSignIn(true);
      else setError(describeApiError(err, "Could not save your profile"));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <Card aria-busy="true">
        <CardBody className="stack-md">
          <span className="sr-only" role="status">Loading…</span>
          <Skeleton width="30%" height={16} />
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </CardBody>
      </Card>
    );
  }

  if (needsSignIn) {
    return (
      <Card>
        <EmptyState
          icon={<LogIn size={20} />}
          title="Sign in to complete your profile"
          action={<Button onClick={() => void signIn()}>Sign in</Button>}
        />
      </Card>
    );
  }

  const field = (id: keyof FormState, label: string, opts: FieldOptions) => {
    const required = opts.required ?? true;
    return (
      <Field label={label} id={id} hint={opts.help} required={required}>
        <Input
          type={opts.type ?? "text"}
          maxLength={opts.max}
          autoComplete={opts.auto}
          required={required}
          value={form[id]}
          onChange={set(id)}
        />
      </Field>
    );
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <Card>
        <CardHeader title="Name and contact" />
        <CardBody className="form-grid">
          {loadError && <InlineAlert tone="danger">{loadError}</InlineAlert>}
          <div className="form-grid form-grid-2">
            {field("firstName", "First name", { max: 80, auto: "given-name" })}
            {field("lastName", "Last name", { max: 80, auto: "family-name" })}
          </div>
          <div className="form-grid form-grid-2">
            {field("email", "Email", { max: 254, type: "email", auto: "email", help: "Email is a contact address only; it is not verified." })}
            {field("phone", "Phone", { max: 20, type: "tel", auto: "tel" })}
          </div>
        </CardBody>
        <CardHeader title="Address" style={{ borderTop: "1px solid var(--border)" }} />
        <CardBody className="form-grid">
          {field("addressLine1", "Address line 1", { max: 120, auto: "address-line1" })}
          {field("addressLine2", "Address line 2 (optional)", { max: 120, auto: "address-line2", required: false })}
          <div className="form-grid form-grid-2">
            {field("city", "City", { max: 80, auto: "address-level2" })}
            {field("region", "State / region (optional)", { max: 80, auto: "address-level1", required: false })}
          </div>
          <div className="form-grid form-grid-2">
            {field("postalCode", "Postal code", { max: 20, auto: "postal-code" })}
            <Field label="Country" id="country" required>
              <Select required autoComplete="country" value={form.country} onChange={set("country")}>
                <option value="">Select a country</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
        <CardHeader title="Date of birth" style={{ borderTop: "1px solid var(--border)" }} />
        <CardBody>
          <div className="form-grid form-grid-2">
            <Field label="Date of birth" id="dateOfBirth" required hint="You must be 18 or older">
              <Input
                type="date"
                required
                autoComplete="bday"
                min="1900-01-02"
                max={maxDob}
                value={form.dateOfBirth}
                onChange={set("dateOfBirth")}
              />
            </Field>
          </div>
        </CardBody>
        <CardFooter style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            {saved && !error && <InlineAlert tone="success">Profile saved.</InlineAlert>}
            {!error && !saved && problems.length > 0 && <p className="panel-note">{problems[0]}</p>}
          </div>
          <Button type="submit" loading={saving} disabled={problems.length > 0} title={problems[0]}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
