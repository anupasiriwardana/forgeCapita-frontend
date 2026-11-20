"use client";

import { createContext, useContext, useId, type AriaAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Error text; when set the control gets aria-invalid and the message is linked via aria-describedby. */
  error?: ReactNode;
  required?: boolean;
  /** Override the generated control id. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Label, hint and error wrapper; Input, Textarea and Select inside it are wired automatically. */
export function Field({ label, hint, error, required = false, id, className, children }: FieldProps): React.ReactElement {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={className}>
        <label className="label" htmlFor={controlId}>
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: "var(--danger)", marginLeft: 4 }}>
              *
            </span>
          )}
        </label>
        {children}
        {hint && (
          <p id={hintId} className="field-hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

interface ControlA11y {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  required?: boolean;
}

function useControlProps(props: ControlA11y): ControlA11y {
  const field = useContext(FieldContext);
  if (!field) return props;
  const describedBy = [field.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return {
    id: props.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": field.invalid ? true : props["aria-invalid"],
    required: props.required ?? (field.required || undefined),
  };
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, ref, ...rest }: InputProps): React.ReactElement {
  const a11y = useControlProps(rest);
  return <input ref={ref} className={cx("input-field", className)} {...rest} {...a11y} />;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ref, ...rest }: TextareaProps): React.ReactElement {
  const a11y = useControlProps(rest);
  return <textarea ref={ref} className={cx("input-field", className)} {...rest} {...a11y} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ className, ref, children, ...rest }: SelectProps): React.ReactElement {
  const a11y = useControlProps(rest);
  return (
    <select ref={ref} className={cx("input-field", className)} {...rest} {...a11y}>
      {children}
    </select>
  );
}
