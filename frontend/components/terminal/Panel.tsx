"use client";

import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface ${className}`}>{children}</section>;
}

export function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  right,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-1">
      <div role="tablist" className="scroll-thin flex h-full items-center overflow-x-auto whitespace-nowrap">
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={`relative h-full px-3 text-xs font-medium transition-colors ${active ? "text-text" : "text-muted hover:text-text"}`}
            >
              {t.label}
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      {right && <div className="pr-2">{right}</div>}
    </div>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
      <span className="text-xs font-medium">{children}</span>
      {right}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="grid h-full min-h-32 place-items-center p-6 text-center">
      <div className="max-w-xs">
        <p className="text-sm font-medium">{title}</p>
        {body && <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
