"use client";

import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface ${className}`}>{children}</section>;
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

const ICON_PROPS = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const EmptyIcons = {
  chart: (
    <svg {...ICON_PROPS}>
      <path d="M4 19V5M4 19h16" />
      <path d="m8 14 3-4 3 2 4-6" />
    </svg>
  ),
  shield: (
    <svg {...ICON_PROPS}>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </svg>
  ),
  lock: (
    <svg {...ICON_PROPS}>
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  wallet: (
    <svg {...ICON_PROPS}>
      <path d="M4 7h14a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Zm0 0V6a1 1 0 0 1 1-1h11" />
      <path d="M16 13.5h2" />
    </svg>
  ),
} as const;

export function EmptyState({ title, body, action, icon = EmptyIcons.chart }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid h-full min-h-40 place-items-center p-6 text-center">
      <div className="flex max-w-xs flex-col items-center">
        <span className="grid size-10 place-items-center border border-border-strong text-muted">{icon}</span>
        <p className="mt-3 text-[13px] font-semibold">{title}</p>
        {body && <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

/** Placeholder rows shown while a table loads. */
export function SkeletonRows({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} role="status" className="animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-6 border-b border-border px-3">
          <span className="h-2.5 w-24 bg-surface-3" />
          <span className="ml-auto h-2.5 w-16 bg-surface-3" />
          <span className="hidden h-2.5 w-20 bg-surface-3 sm:block" />
          <span className="hidden h-2.5 w-20 bg-surface-3 md:block" />
          <span className="h-2.5 w-24 bg-surface-3" />
        </div>
      ))}
    </div>
  );
}
