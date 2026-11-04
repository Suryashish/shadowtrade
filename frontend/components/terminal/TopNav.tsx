"use client";

import type { ShadowTrade } from "@/hooks/useShadowTrade";
import type { WalletState } from "@/hooks/useWallet";
import { IS_FORK } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import Link from "next/link";
import { Logo } from "../brand/Logo";

export function TopNav({ wallet, app }: { wallet: WalletState; app: ShadowTrade }) {
  const session = app.session;
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <div className="flex items-center gap-5">
        <Link href="/" aria-label="ShadowTrade home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-4 text-[13px] md:flex">
          <span className="font-medium text-text">Trade</span>
          <a href="https://testnet.monadscan.com" target="_blank" rel="noreferrer" className="text-muted hover:text-text">
            Explorer
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <span className={`hidden rounded-md px-2 py-1 text-[11px] font-medium sm:inline ${IS_FORK ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"}`}>
          {IS_FORK ? "Local fork" : "Monad Testnet"}
        </span>
        {session && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent" title={`Burner ${session.burner.address}`}>
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            Stealth
            <span className="hidden font-mono md:inline">· {shortAddress(session.burner.address)}</span>
          </span>
        )}
        {wallet.address ? (
          <button
            onClick={wallet.disconnect}
            disabled={!!session}
            title={session ? "Exit Stealth Mode before disconnecting" : "Disconnect"}
            className="group inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2.5 font-mono text-xs disabled:cursor-default"
          >
            <span className="size-1.5 rounded-full bg-success" />
            <span className="group-enabled:group-hover:hidden">{shortAddress(wallet.address)}</span>
            <span className="hidden font-sans text-muted group-enabled:group-hover:inline">Disconnect</span>
          </button>
        ) : (
          <button onClick={wallet.connect} disabled={wallet.connecting} className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-text hover:bg-accent-hover">
            {wallet.connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
