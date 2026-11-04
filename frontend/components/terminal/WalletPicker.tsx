"use client";

import { useEffect } from "react";
import { DEV_WALLET_AVAILABLE, type WalletState } from "@/hooks/useWallet";

export function WalletPicker({ wallet }: { wallet: WalletState }) {
  const { picking, closePicker } = wallet;

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePicker();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, closePicker]);

  if (!picking) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={closePicker}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="wallet-picker-title" className="text-sm font-semibold">
            Connect a wallet
          </h2>
          <button onClick={closePicker} aria-label="Close" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {wallet.options.map((o) => (
            <li key={o.info.uuid}>
              <button
                onClick={() => wallet.connectWith(o.info.rdns)}
                className="flex h-11 w-full items-center gap-3 rounded-md border border-border bg-surface-2 px-3 text-[13px] font-medium transition-colors hover:border-border-strong"
              >
                {o.info.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs
                  <img src={o.info.icon} alt="" className="size-6 rounded" />
                ) : (
                  <span aria-hidden className="size-6 rounded bg-border" />
                )}
                {o.info.name}
              </button>
            </li>
          ))}
          {DEV_WALLET_AVAILABLE && (
            <li>
              <button onClick={wallet.connectDev} className="h-9 w-full rounded-md border border-border text-xs text-muted hover:text-text">
                Use dev wallet
              </button>
            </li>
          )}
        </ul>
        <p className="mt-3 text-[11px] text-muted">Don&apos;t see your wallet? Make sure its extension is installed and enabled, then reload.</p>
      </div>
    </div>
  );
}
