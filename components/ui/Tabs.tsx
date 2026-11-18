"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  content: ReactNode;
}

interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** Controlled tabs with a tablist and arrow-key navigation; only the active panel is rendered. */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>): React.ReactElement {
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, items.findIndex((t) => t.value === value));
  const active = items[activeIndex];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (items.length === 0) return;
    const last = items.length - 1;
    let next: number;
    if (e.key === "ArrowRight") next = activeIndex === last ? 0 : activeIndex + 1;
    else if (e.key === "ArrowLeft") next = activeIndex === 0 ? last : activeIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="ui-tabs" onKeyDown={onKeyDown}>
        {items.map((t, i) => {
          const selected = i === activeIndex;
          return (
            <button
              key={t.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${baseId}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.value)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${activeIndex}`} className="ui-tab-panel" style={{ paddingTop: 16 }}>
          {active.content}
        </div>
      )}
    </div>
  );
}
