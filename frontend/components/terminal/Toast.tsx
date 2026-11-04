"use client";

import { useEffect } from "react";
import type { Activity } from "@/hooks/useShadowTrade";
import { Spinner } from "../ui";

const SUCCESS_DISMISS_MS = 6000;

export function Toast({ activity, onDismiss }: { activity: Activity; onDismiss: () => void }) {
  useEffect(() => {
    if (activity.kind !== "done") return;
    const id = setTimeout(onDismiss, SUCCESS_DISMISS_MS);
    return () => clearTimeout(id);
  }, [activity, onDismiss]);

  if (activity.kind === "idle") return null;

  const bar = activity.kind === "error" ? "bg-danger" : activity.kind === "done" ? "bg-success" : "bg-accent";

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-end sm:inset-x-auto sm:right-4 sm:bottom-4">
      <div
        role={activity.kind === "error" ? "alert" : "status"}
        data-toast={activity.kind}
        aria-live="polite"
        className="animate-fade-in pointer-events-auto relative w-full overflow-hidden rounded-md border border-border-strong bg-surface py-3 pr-3 pl-4 shadow-pop sm:w-[360px]"
      >
        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${bar}`} />
        {activity.kind === "busy" ? (
          <>
            <div className="flex items-center gap-2.5">
              <Spinner className="size-3.5 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Working</p>
                <p className="mt-0.5 text-[13px] leading-snug font-semibold">{activity.step.label}…</p>
              </div>
              {activity.step.total > 1 && (
                <span className="tabular self-start font-mono text-[11px] text-muted">
                  {activity.step.index}/{activity.step.total}
                </span>
              )}
            </div>
            {activity.step.total > 1 && (
              <div className="mt-3 flex gap-1" aria-hidden>
                {Array.from({ length: activity.step.total }, (_, i) => (
                  <span key={i} className={`h-0.5 flex-1 ${i < activity.step.index ? "bg-accent" : "bg-surface-3"}`} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2.5">
            <span aria-hidden className={`mt-px grid size-4 shrink-0 place-items-center text-sm leading-none ${activity.kind === "error" ? "text-danger" : "text-success"}`}>
              {activity.kind === "error" ? "!" : "✓"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug font-semibold">{activity.kind === "error" ? "Something went wrong" : "Done"}</p>
              <p className="mt-0.5 text-xs leading-snug break-words text-muted">{activity.message}</p>
            </div>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="-mt-0.5 -mr-0.5 grid size-6 shrink-0 place-items-center text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <path d="m2 2 8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
