"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/ui/cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, for example "Time range". */
  label: string;
  className?: string;
}

/** Pill group (for example 1D / 1W / 1M) behaving as a radio group with arrow-key navigation. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>): React.ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key) || options.length === 0) return;
    e.preventDefault();
    const current = Math.max(0, options.findIndex((o) => o.value === value));
    const last = options.length - 1;
    let next = current;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = current === last ? 0 : current + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = current === 0 ? last : current - 1;
    else if (e.key === "Home") next = 0;
    else next = last;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("ui-segmented", className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
