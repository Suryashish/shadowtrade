"use client";

import { useEffect } from "react";
import type { WalletState } from "@/hooks/useWallet";

export function WalletPicker({ wallet }: { wallet: WalletState }) {
  const { pickerOpen, closePicker } = wallet;

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePicker();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen, closePicker]);

  if (!pickerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/70 px-4 backdrop-blur-sm" onClick={closePicker}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in w-full max-w-[340px] rounded-md border border-border-strong bg-surface p-4 shadow-pop"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="wallet-picker-title" className="text-sm font-medium">
            Connect a wallet
          </h2>
          <button onClick={closePicker} aria-label="Close" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {wallet.wallets.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => wallet.connectWith(w.id)}
                className="flex h-11 w-full items-center gap-3 rounded-md border border-border bg-surface-2 px-3 text-left text-[13px] hover:border-border-strong hover:bg-surface-3"
              >
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs
                  <img src={w.icon} alt="" className="size-6 rounded" />
                ) : (
                  <span aria-hidden className="size-6 rounded bg-surface-3" />
                )}
                {w.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
