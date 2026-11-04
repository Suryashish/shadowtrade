"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ShadowTrade } from "@/hooks/useShadowTrade";
import type { TerminalMarket } from "@/hooks/useMarketData";
import { DEV_WALLET_AVAILABLE, type WalletState } from "@/hooks/useWallet";
import { BUCKETS, TOKENS, type Venue } from "@/lib/config";
import { formatToken } from "@/lib/format";
import { privacyReport, type PrivacyReport } from "@/lib/privacy";
import { DepositForm } from "./BalanceForms";
import { Panel } from "./Panel";
import { PerpsOrderForm } from "./PerpsOrderForm";
import { SpotOrderForm } from "./SpotOrderForm";

const MIN_BUCKET = BUCKETS[0];

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function StepRow({ n, title, done, active, summary, children }: { n: number; title: string; done: boolean; active: boolean; summary?: ReactNode; children?: ReactNode }) {
  return (
    <li className={`border-b border-border px-3 py-3 last:border-b-0 ${active ? "" : "opacity-90"}`}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
            done ? "bg-success-soft text-success" : active ? "bg-accent text-accent-text" : "bg-surface-3 text-faint"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <span className={`text-[13px] font-medium ${active || done ? "text-text" : "text-faint"}`}>{title}</span>
        {done && summary && <span className="ml-auto truncate text-xs text-muted">{summary}</span>}
      </div>
      {active && children && <div className="animate-fade-in mt-3 pl-[30px]">{children}</div>}
    </li>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
    >
      {children}
    </button>
  );
}

function PrivacyMeter({ report }: { report: PrivacyReport }) {
  const color = report.grade === "Strong" ? "bg-success" : report.grade === "Fair" ? "bg-warning" : "bg-danger";
  const text = report.grade === "Strong" ? "text-success" : report.grade === "Fair" ? "text-warning" : "text-danger";
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Privacy score</span>
        <span className={`tabular font-mono font-semibold ${text}`}>
          {report.score} · {report.grade}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" role="meter" aria-label="Privacy score" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${report.score}%` }} />
      </div>
      <ul className="mt-2 space-y-1">
        {report.checks.map((c) => (
          <li key={c.label} className="flex gap-1.5 text-[11px] leading-snug" title={c.detail}>
            <span aria-hidden className={c.ok ? "text-success" : "text-warning"}>
              {c.ok ? "✓" : "!"}
            </span>
            <span className={c.ok ? "text-muted" : "text-text"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EnterStealth({ app, venue, busy }: { app: ShadowTrade; venue: Venue; busy: boolean }) {
  const token = TOKENS[venue];
  const available = Number(app.balances[venue].private) / 10 ** token.decimals;
  const [bucket, setBucket] = useState<number>(MIN_BUCKET);
  const [confirming, setConfirming] = useState(false);
  const now = useNow(30_000);
  const report = privacyReport({
    bucket,
    poolLiquidity: Number(app.balances[venue].pool) / 10 ** token.decimals,
    secondsSinceLastDeposit: app.lastDeposit ? (now - app.lastDeposit.at) / 1000 : null,
    lastDepositAmount: app.lastDeposit?.amount ?? null,
  });

  if (confirming) {
    return (
      <div className="space-y-3 text-xs">
        <ul className="space-y-1.5 text-muted">
          <li>A new burner wallet is created in this tab.</li>
          <li>
            <span className="tabular font-mono text-text">
              {bucket.toLocaleString()} {token.symbol}
            </span>{" "}
            moves to it from your private balance. Gas comes from the shared relayer.
          </li>
          <li>{venue === "perpl" ? "A Perpl margin account opens" : "Funds are deposited into Kuru"} from the burner.</li>
          <li className="text-warning">Keep this tab open until you exit. The burner key is never saved.</li>
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setConfirming(false)} className="h-10 rounded-lg border border-border text-sm text-muted hover:text-text">
            Back
          </button>
          <PrimaryButton
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              app.enter(venue, bucket);
            }}
          >
            Confirm
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex justify-between text-[11px] text-faint">
          <span>Session size ({token.symbol})</span>
          <span className="tabular">Private {available.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              disabled={b > available}
              aria-pressed={bucket === b}
              className={`tabular h-8 rounded-md border font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                bucket === b ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-text"
              }`}
            >
              {b >= 1000 ? `${b / 1000}k` : b}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-faint">Standard sizes, so your amount can&apos;t fingerprint you.</p>
      </div>
      <PrivacyMeter report={report} />
      <PrimaryButton onClick={() => setConfirming(true)} disabled={busy || bucket > available}>
        Enter Stealth Mode
      </PrimaryButton>
    </div>
  );
}

function Onboarding({ app, wallet, venue, busy }: { app: ShadowTrade; wallet: WalletState; venue: Venue; busy: boolean }) {
  const token = TOKENS[venue];
  const connected = !!wallet.address;
  const unlocked = !!app.shadow;
  const funded = app.balancesLoaded && Number(app.balances[venue].private) / 10 ** token.decimals >= MIN_BUCKET;
  const current = !connected ? 1 : !unlocked ? 2 : !funded ? 3 : 4;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-3 py-3">
        <p className="text-[13px] font-semibold">Trade from a wallet nobody can trace</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Your orders run from a fresh burner funded by a shared pool, never from your own wallet.
        </p>
      </div>
      <ol className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <StepRow n={1} title="Connect wallet" done={connected} active={current === 1} summary={wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : undefined}>
          <div className="space-y-2">
            <PrimaryButton onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Connecting…" : "Connect wallet"}
            </PrimaryButton>
            {DEV_WALLET_AVAILABLE && (
              <button onClick={wallet.connectDev} className="h-9 w-full rounded-lg border border-border text-xs text-muted hover:text-text">
                Use test wallet
              </button>
            )}
            {wallet.error && <p className="text-[11px] text-danger">{wallet.error}</p>}
          </div>
        </StepRow>
        <StepRow n={2} title="Unlock private balance" done={unlocked} active={current === 2} summary="Unlocked">
          <p className="mb-2.5 text-xs leading-relaxed text-muted">Sign a free message to derive your private key on this device. No transaction.</p>
          <PrimaryButton onClick={app.unlock}>Sign to unlock</PrimaryButton>
        </StepRow>
        <StepRow
          n={3}
          title={`Fund private balance`}
          done={funded}
          active={current === 3}
          summary={`${formatToken(app.balances[venue].private)} ${token.symbol}`}
        >
          <p className="mb-2.5 text-xs leading-relaxed text-muted">
            Deposit {token.symbol} from your wallet. You need at least {MIN_BUCKET} to start a session.
          </p>
          <DepositForm app={app} venue={venue} busy={busy} />
        </StepRow>
        <StepRow n={4} title="Enter Stealth Mode" done={false} active={current === 4}>
          <EnterStealth app={app} venue={venue} busy={busy} />
        </StepRow>
      </ol>
    </div>
  );
}

function SessionStrip({ app, busy }: { app: ShadowTrade; busy: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const session = app.session;
  if (!session) return null;
  return (
    <div className="border-t border-border p-3">
      {confirming ? (
        <div className="animate-fade-in space-y-2.5">
          <p className="text-xs leading-relaxed text-muted">
            {session.venue === "perpl" ? "Open positions close at market." : "Holdings sell to USDC at market."} Everything returns to your private balance and the burner
            key is wiped.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirming(false)} className="h-9 rounded-lg border border-border text-xs text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                app.exit();
              }}
              className="h-9 rounded-lg bg-text text-xs font-medium text-bg hover:opacity-90"
            >
              Close all & exit
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="h-9 w-full rounded-lg border border-border-strong text-xs font-medium text-text transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          Exit Stealth Mode
        </button>
      )}
    </div>
  );
}

export function OrderPanel({
  app,
  wallet,
  market,
  priceHint,
  onSwitchVenue,
}: {
  app: ShadowTrade;
  wallet: WalletState;
  market: TerminalMarket;
  priceHint: number | null;
  onSwitchVenue: (v: Venue) => void;
}) {
  const busy = app.activity.kind === "busy";
  const session = app.session;

  let body: ReactNode;
  if (!session) body = <Onboarding app={app} wallet={wallet} venue={market.venue} busy={busy} />;
  else if (session.venue !== market.venue)
    body = (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="text-sm font-medium">Your stealth session is on {session.venue === "perpl" ? "Perps" : "Spot"}</p>
          <p className="mt-1 text-xs text-muted">Exit it to trade here, or switch back.</p>
          <button onClick={() => onSwitchVenue(session.venue)} className="mt-3 h-9 rounded-lg border border-border-strong px-4 text-xs font-medium hover:bg-surface-2">
            Back to {session.venue === "perpl" ? "Perps" : "Spot"}
          </button>
        </div>
      </div>
    );
  else
    body = (
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {market.venue === "perpl" ? (
          <PerpsOrderForm session={session} market={market.perp} run={app.run} busy={busy} priceHint={priceHint} />
        ) : (
          <SpotOrderForm session={session} market={market.spot} run={app.run} busy={busy} />
        )}
      </div>
    );

  return (
    <Panel className="h-full">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium">{market.venue === "perpl" ? "Perpetuals · Perpl" : "Spot · Kuru"}</span>
        {session ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Stealth
          </span>
        ) : (
          <span className="text-[11px] text-faint">Market orders</span>
        )}
      </div>
      {body}
      <SessionStrip app={app} busy={busy} />
    </Panel>
  );
}
