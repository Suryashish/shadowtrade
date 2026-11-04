"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import type { ShadowTrade } from "@/hooks/useShadowTrade";
import { usePoll } from "@/hooks/usePoll";
import { publicClient } from "@/lib/chain";
import { EXPLORER, KURU_ENABLED, TOKENS, VENUES, type Venue } from "@/lib/config";
import { formatToken } from "@/lib/format";
import type { StealthSession } from "@/lib/session";
import { Address } from "../ui";
import { DepositForm, WithdrawForm } from "./BalanceForms";
import { EmptyState, Panel, PanelTabs } from "./Panel";
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="tabular mt-1 truncate font-mono text-[13px]">{children}</div>
    </div>
  );
}

function SessionDetails({ session }: { session: StealthSession }) {
  const elapsed = useElapsed(session.startedAt);
  const gas = usePoll(() => publicClient.getBalance({ address: session.burner.address }), 5000, session.burner.address);
  const token = TOKENS[session.venue];
  return (
    <div className="grid gap-3 p-3 md:grid-cols-[1.2fr_1fr] md:gap-4">
      <div className="grid grid-cols-2 content-start gap-x-4 gap-y-2.5 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4">
          <div className="text-[11px] text-faint">Burner wallet</div>
          <div className="mt-1">
            <Address address={session.burner.address} />
          </div>
        </div>
        <Field label="Venue">{session.venue === "perpl" ? "Perpl perps" : "Kuru spot"}</Field>
        <Field label="Session size">
          {session.bucket.toLocaleString()} {token.symbol}
        </Field>
        <Field label="Gas left">{gas.data === null ? "…" : `${Number(formatEther(gas.data)).toFixed(3)} MON`}</Field>
        <Field label="Running for">{elapsed}</Field>
      </div>
      <div className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs leading-relaxed text-muted">
        <p className="font-medium text-text">What an observer sees</p>
        <ul className="mt-1 space-y-0.5">
          <li>• A brand-new wallet, funded only by the shared pool and the gas relayer.</li>
          <li>• No transaction to or from your own wallet, ever.</li>
          <li>• On exit, funds go back to the pool and the burner goes quiet.</li>
        </ul>
        <a href={`${EXPLORER}/address/${session.burner.address}`} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-accent hover:underline">
          Verify on Monadscan ↗
        </a>
      </div>
    </div>
  );
}

function PrivateBalances({ app, busy }: { app: ShadowTrade; busy: boolean }) {
  const [venue, setVenue] = useState<Venue>("perpl");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  if (!app.shadow) return <EmptyState title="Private balance is locked" body="Connect and unlock with a signature to see and fund it." />;
  const rows = VENUES.map((v) => ({ v, t: TOKENS[v], b: app.balances[v] }));
  return (
    <div className="grid items-start gap-3 p-3 pb-5 md:grid-cols-[1.3fr_1fr]">
      <table className="w-full text-xs">
        <thead>
          <tr className="h-7 text-left text-[11px] text-faint">
            <th className="font-normal">Asset</th>
            <th className="text-right font-normal">Private</th>
            <th className="text-right font-normal">Wallet</th>
            <th className="hidden text-right font-normal sm:table-cell">Pool size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ v, t, b }) => (
            <tr key={v} className="h-10 border-t border-border">
              <td>
                <span className="font-medium">{t.symbol}</span> <span className="text-faint">· {v === "perpl" ? "perps" : "spot"}</span>
              </td>
              <td className="tabular text-right font-mono">{formatToken(b.private)}</td>
              <td className="tabular text-right font-mono text-muted">{formatToken(b.wallet)}</td>
              <td className="tabular hidden text-right font-mono text-muted sm:table-cell">{formatToken(b.pool, 6, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rounded-lg border border-border p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex gap-1 rounded-md bg-surface-2 p-0.5 text-xs">
            {(["deposit", "withdraw"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded px-2.5 py-1 capitalize ${mode === m ? "bg-surface text-text shadow-card" : "text-muted"}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-1 text-xs">
            {VENUES.map((v) => (
              <button key={v} onClick={() => setVenue(v)} className={`rounded px-2 py-1 ${venue === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}>
                {TOKENS[v].symbol}
              </button>
            ))}
          </div>
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
  const total = app.shadow ? Number(app.balances.perpl.private + app.balances.kuru.private) / 1e6 : null;

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
            <span className="tabular hidden font-mono text-[11px] text-muted sm:inline">
              Private ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
            <EmptyState title="No active session" body="Enter Stealth Mode from the order panel. Your burner wallet's details appear here." />
          ))}
        {tab === "balance" && <PrivateBalances app={app} busy={busy} />}
      </div>
    </Panel>
  );
}
