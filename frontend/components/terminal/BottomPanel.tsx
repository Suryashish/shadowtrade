"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import type { ShadowTrade } from "@/hooks/useShadowTrade";
import { usePoll } from "@/hooks/usePoll";
import { publicClient } from "@/lib/chain";
import { EXPLORER, KURU_ENABLED, TOKENS, VENUES, type Venue } from "@/lib/config";
import { formatToken } from "@/lib/format";
import type { StealthSession } from "@/lib/session";
import { shortAddress } from "@/lib/format";
import { DepositForm, WithdrawForm } from "./BalanceForms";
import { EmptyIcons, EmptyState, Panel, PanelTabs } from "./Panel";
import { PositionsTable } from "./PositionsTable";
import { SpotHoldings } from "./SpotHoldings";

type Tab = "positions" | "holdings" | "session" | "balance";

function useElapsed(since: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function Long({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-9 items-center justify-between gap-4 border-b border-border last:border-b-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular flex min-w-0 items-center gap-2 font-mono text-[13px]">{children}</dd>
    </div>
  );
}

const linkBtn = "rounded px-1.5 py-0.5 font-sans text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} aria-label="Copy address" className={linkBtn}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SessionDetails({ session }: { session: StealthSession }) {
  const elapsed = useElapsed(session.startedAt);
  const gas = usePoll(() => publicClient.getBalance({ address: session.burner.address }), 5000, session.burner.address);
  const token = TOKENS[session.venue];
  const explorer = `${EXPLORER}/address/${session.burner.address}`;
  return (
    <div className="grid items-start gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <dl className="border border-border px-3">
        <Row label="Burner wallet">
          <span>{shortAddress(session.burner.address)}</span>
          <CopyButton value={session.burner.address} />
          <a href={explorer} target="_blank" rel="noreferrer" className={linkBtn}>
            Explorer ↗
          </a>
        </Row>
        <Row label="Venue">{session.venue === "perpl" ? "Perpl perps" : "Kuru spot"}</Row>
        <Row label="Session size">
          {session.bucket.toLocaleString()} {token.symbol}
        </Row>
        <Row label="Gas left">{gas.data === null ? "…" : `${Number(formatEther(gas.data)).toFixed(3)} MON`}</Row>
        <Row label="Running for">{elapsed}</Row>
      </dl>
      <div className="border border-border bg-surface-2 p-3">
        <p className="text-xs font-semibold">What an observer sees</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-snug text-muted">
          {[
            "A brand-new wallet, funded only by the shared pool and the gas relayer.",
            "No transaction to or from your own wallet, ever.",
            "On exit, funds go back to the pool and the burner goes quiet.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-px shrink-0 text-success">
                <path d="m3 7.5 2.5 2.5L11 4" />
              </svg>
              {t}
            </li>
          ))}
        </ul>
        <a href={explorer} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium text-accent hover:underline">
          Verify on Monadscan ↗
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-border px-3 py-2.5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="tabular mt-1 truncate font-mono text-lg font-medium">{value}</div>
    </div>
  );
}

function PrivateBalances({ app, busy }: { app: ShadowTrade; busy: boolean }) {
  const [venue, setVenue] = useState<Venue>(VENUES[0]);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  if (!app.shadow) {
    return <EmptyState icon={EmptyIcons.lock} title="Private balance is locked" body="Connect and unlock with a signature to see and fund it." />;
  }
  const b = app.balances[venue];
  const sym = TOKENS[venue].symbol;
  return (
    <div className="grid items-start gap-4 p-4 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Stat label={`Private balance · ${sym}`} value={formatToken(b.private)} />
        </div>
        <Stat label="Wallet" value={formatToken(b.wallet)} />
        <Stat label="Pool size" value={formatToken(b.pool, 6, 0)} />
      </div>
      <div className="border border-border p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex gap-1 rounded bg-surface-2 p-0.5 text-xs">
            {(["deposit", "withdraw"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-sm px-2.5 py-1 capitalize ${mode === m ? "bg-surface text-text shadow-card" : "text-muted"}`}>
                {m}
              </button>
            ))}
          </div>
          {VENUES.length > 1 && (
            <div className="flex gap-1 text-xs">
              {VENUES.map((v) => (
                <button key={v} onClick={() => setVenue(v)} className={`rounded px-2 py-1 ${venue === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}>
                  {TOKENS[v].symbol}
                </button>
              ))}
            </div>
          )}
        </div>
        {mode === "deposit" ? <DepositForm key={venue} app={app} venue={venue} busy={busy} /> : <WithdrawForm key={venue} app={app} venue={venue} busy={busy} />}
      </div>
    </div>
  );
}

/** Remount (via key) when the session venue changes so it opens on the tab that matters. */
export function BottomPanel({ app, onSelectPerp }: { app: ShadowTrade; onSelectPerp: (perpId: number) => void }) {
  const [tab, setTab] = useState<Tab>(app.session?.venue === "kuru" ? "holdings" : "positions");
  const busy = app.activity.kind === "busy";
  const session = app.session;
  // Only venues that are enabled count; a disabled venue's balance isn't usable here.
  const total = app.shadow ? VENUES.reduce((sum, v) => sum + Number(app.balances[v].private) / 10 ** TOKENS[v].decimals, 0) : null;

  return (
    <Panel className="h-full">
      <PanelTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "positions", label: "Positions" },
          ...(KURU_ENABLED ? [{ value: "holdings" as const, label: <Long short="Spot" long="Spot holdings" /> }] : []),
          { value: "session", label: <Long short={session ? "Session ●" : "Session"} long={session ? "Stealth session ●" : "Stealth session"} /> },
          { value: "balance", label: <Long short="Balance" long="Private balance" /> },
        ]}
        right={
          total !== null && (
            <span className="hidden items-baseline gap-1.5 text-[11px] text-faint sm:inline-flex">
              Private balance
              <span className="tabular font-mono text-xs text-text">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
          )
        }
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "positions" && (
          <PositionsTable session={session?.venue === "perpl" ? session : null} markets={app.markets} run={app.run} busy={busy} onSelectMarket={onSelectPerp} />
        )}
        {tab === "holdings" && <SpotHoldings session={session?.venue === "kuru" ? session : null} run={app.run} busy={busy} />}
        {tab === "session" &&
          (session ? (
            <SessionDetails session={session} />
          ) : (
            <EmptyState icon={EmptyIcons.shield} title="No active session" body="Enter Stealth Mode from the order panel. Your burner wallet's details appear here." />
          ))}
        {tab === "balance" && <PrivateBalances app={app} busy={busy} />}
      </div>
    </Panel>
  );
}
