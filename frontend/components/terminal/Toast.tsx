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

  const tone =
    activity.kind === "error" ? "border-danger/40" : activity.kind === "done" ? "border-success/40" : "border-accent/40";

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-end sm:inset-x-auto sm:right-4 sm:bottom-4">
      <div
        role={activity.kind === "error" ? "alert" : "status"}
        data-toast={activity.kind}
        aria-live="polite"
        className={`animate-fade-in pointer-events-auto w-full rounded-xl border bg-surface p-3.5 shadow-pop sm:w-[360px] ${tone}`}
      >
        {activity.kind === "busy" ? (
          <>
            <div className="flex items-center gap-2.5">
              <Spinner className="size-3.5 text-accent" />
              <p className="text-[13px] font-medium">{activity.step.label}…</p>
            </div>
            {activity.step.total > 1 && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex flex-1 gap-1" aria-hidden>
                  {Array.from({ length: activity.step.total }, (_, i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i < activity.step.index ? "bg-accent" : "bg-surface-3"}`} />
                  ))}
                </div>
                <span className="tabular font-mono text-[11px] text-muted">
                  {activity.step.index}/{activity.step.total}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-3">
            <span aria-hidden className={`mt-0.5 text-sm ${activity.kind === "error" ? "text-danger" : "text-success"}`}>
              {activity.kind === "error" ? "✕" : "✓"}
            </span>
            <p className="flex-1 text-[13px] leading-snug">
              <span className="font-medium">{activity.kind === "error" ? "Something went wrong. " : ""}</span>
              {activity.message}
            </p>
            <button onClick={onDismiss} className="text-xs text-muted hover:text-text" aria-label="Dismiss">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
