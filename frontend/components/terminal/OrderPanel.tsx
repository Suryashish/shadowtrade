"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatEther } from "viem";
import { usePoll } from "@/hooks/usePoll";
import { publicClient } from "@/lib/chain";
import { getAccount, getPosition } from "@/lib/perpl";
import type { StealthSession } from "@/lib/session";
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
        <span className={`text-[13px] font-medium ${active || done ? "text-text" : "text-muted"}`}>{title}</span>
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
      className="h-10 w-full rounded-md bg-accent text-[13px] font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-surface-2 disabled:text-muted"
    >
      {children}
    </button>
  );
}

function PrivacyMeter({ report }: { report: PrivacyReport }) {
  const color = report.grade === "Strong" ? "bg-success" : report.grade === "Fair" ? "bg-warning" : "bg-danger";
  const text = report.grade === "Strong" ? "text-success" : report.grade === "Fair" ? "text-warning" : "text-danger";
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Privacy score</span>
        <span className={`tabular font-mono font-semibold ${text}`}>
          {report.score} · {report.grade}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3" role="meter" aria-label="Privacy score" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${report.score}%` }} />
      </div>
      <ul className="mt-2 space-y-1">
        {report.checks.map((c) => (
          <li key={c.label} className="text-[11px] leading-snug">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className={`w-3 text-center font-mono ${c.ok ? "text-success" : "text-warning"}`}>
                {c.ok ? "✓" : "!"}
              </span>
              <span className={c.ok ? "text-muted" : "text-text"}>{c.label}</span>
            </div>
            {!c.ok && <p className="mt-0.5 pl-[18px] text-warning">{c.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`tabular min-w-0 text-right text-text ${mono ? "font-mono" : ""}`}>{value}</dd>
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
      <div className="space-y-3">
        <dl className="divide-y divide-border rounded-md border border-border bg-surface-2 px-2.5">
          <SummaryRow label="Session size" value={`${bucket.toLocaleString()} ${token.symbol}`} mono />
          <SummaryRow label="Venue" value={venue === "perpl" ? "Perpl perps" : "Kuru spot"} />
          <SummaryRow label="Gas" value="0.5 MON, paid by the relayer" />
          <SummaryRow label="Your wallet" value="never touches the burner" />
        </dl>
        <p className="text-[11px] leading-snug text-muted">Saved encrypted on this device · erased when you exit</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setConfirming(false)} className="h-10 rounded-md border border-border text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text">
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
              title={b > available ? "Your private balance is below this size" : undefined}
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
              <button onClick={wallet.connectDev} className="h-9 w-full rounded-md border border-border text-xs text-muted hover:text-text">
                Use test wallet
              </button>
            )}
            {wallet.error && <p className="text-[11px] text-danger">{wallet.error}</p>}
          </div>
        </StepRow>
        <StepRow n={2} title="Unlock private balance" done={unlocked} active={current === 2} summary="Unlocked">
          <p className="mb-2.5 text-xs leading-relaxed text-muted">
            {app.resumable ? "You have a stealth session in progress on this device." : "Sign a free message to derive your private key on this device. No transaction."}
          </p>
          <PrimaryButton onClick={app.unlock}>{app.resumable ? "Sign to resume session" : "Sign to unlock"}</PrimaryButton>
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
      <ul className="grid shrink-0 grid-cols-3 divide-x divide-border border-t border-border font-mono text-[10px] uppercase tracking-wide text-muted">
        {["Non-custodial", "Fixed sizes 500–10k", "Gas covered"].map((f) => (
          <li key={f} className="px-2 py-2.5 text-center leading-snug">
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ENTER_PREFIXES = ["Creating a fresh burner", "Sending gas", "Generating zero-knowledge proof", "Opening a Perpl", "Depositing into Kuru"];

function EnteringCard({ venue, index }: { venue: Venue; index: number }) {
  const steps = ["Creating a fresh burner wallet", "Sending gas", "Generating zero-knowledge proof", venue === "perpl" ? "Opening a Perpl margin account" : "Depositing into Kuru"];
  return (
    <div className="flex-1 p-3" role="status" aria-live="polite">
      <div className="rounded-md border border-border bg-surface-2 p-3">
        <p className="text-[13px] font-semibold">Setting up your stealth session</p>
        <p className="mt-0.5 text-xs text-muted">This takes a few seconds. Trading unlocks when it&apos;s ready.</p>
        <ol className="mt-3 space-y-2">
          {steps.map((label, i) => {
            const n = i + 1;
            const done = n < index;
            const active = n === index;
            return (
              <li key={label} className="flex items-center gap-2.5 text-xs">
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    done ? "bg-success-soft text-success" : active ? "animate-pulse bg-accent text-accent-text" : "bg-surface-3 text-faint"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span className={active ? "font-medium text-text" : done ? "text-muted" : "text-faint"}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function AccountRow({ label, value, tone }: { label: string; value: string | null; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px] text-[11px]">
      <dt className="text-muted">{label}</dt>
      {value === null ? (
        <dd className="h-3 w-16 animate-pulse rounded-sm bg-surface-3" aria-label="Loading" />
      ) : (
        <dd className={`tabular font-mono ${tone ?? "text-text"}`}>{value}</dd>
      )}
    </div>
  );
}

const usd = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AccountCard({ app, session }: { app: ShadowTrade; session: StealthSession }) {
  const owner = session.burner.address;
  const markets = app.markets;
  const marketKey = markets.map((m) => m.id).join(",");
  const { data } = usePoll(
    async () => {
      const [account, gas] = await Promise.all([getAccount(owner), publicClient.getBalance({ address: owner })]);
      let margin = 0n;
      let pnl = 0n;
      if (account) {
        const positions = await Promise.all(markets.map((m) => getPosition(m.id, account.id)));
        for (const p of positions) {
          if (!p) continue;
          margin += p.marginCNS;
          pnl += p.pnlCNS;
        }
      }
      return { free: account?.balanceCNS ?? 0n, margin, pnl, gas };
    },
    4000,
    `${owner}:${marketKey}`,
  );
  const num = (v: bigint) => Number(v) / 1e6;
  const pnl = data ? num(data.pnl) : 0;
  const pnlTone = pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "text-muted";
  const gasMon = data ? Number(formatEther(data.gas)) : 0;
  return (
    <section aria-label="Account" className="border-t border-border px-3 py-2.5">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Account</h3>
      <dl>
        <AccountRow label="Equity" value={data ? `${usd(num(data.free + data.margin + data.pnl))} AUSD` : null} />
        <AccountRow label="Available" value={data ? `${usd(num(data.free))} AUSD` : null} />
        <AccountRow label="Margin in use" value={data ? `${usd(num(data.margin))} AUSD` : null} />
        <AccountRow label="Unrealized PnL" value={data ? `${pnl > 0 ? "+" : pnl < 0 ? "-" : ""}${usd(Math.abs(pnl))} AUSD` : null} tone={pnlTone} />
        <AccountRow label="Session size" value={`${session.bucket.toLocaleString()} ${TOKENS[session.venue].symbol}`} />
        <AccountRow label="Burner gas" value={data ? `${gasMon.toLocaleString(undefined, { maximumFractionDigits: 3 })} MON` : null} />
      </dl>
    </section>
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
            <button onClick={() => setConfirming(false)} className="h-9 rounded-md border border-border text-xs text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                app.exit();
              }}
              className="h-9 rounded-md bg-text text-xs font-medium text-bg hover:opacity-90"
            >
              Close all & exit
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="h-9 w-full rounded-md border border-border-strong text-xs font-medium text-text transition-colors hover:bg-surface-2 disabled:opacity-50"
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

  const entering = app.activity.kind === "busy" && ENTER_PREFIXES.some((p) => app.activity.kind === "busy" && app.activity.step.label.startsWith(p));
  const enterIndex = app.activity.kind === "busy" ? app.activity.step.index : 1;

  let body: ReactNode;
  if (entering) body = <EnteringCard venue={session?.venue ?? market.venue} index={enterIndex} />;
  else if (!session) body = <Onboarding app={app} wallet={wallet} venue={market.venue} busy={busy} />;
  else if (session.venue !== market.venue)
    body = (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="text-sm font-medium">Your stealth session is on {session.venue === "perpl" ? "Perps" : "Spot"}</p>
          <p className="mt-1 text-xs text-muted">Exit it to trade here, or switch back.</p>
          <button onClick={() => onSwitchVenue(session.venue)} className="mt-3 h-9 rounded-md border border-border-strong px-4 text-xs font-medium hover:bg-surface-2">
            Back to {session.venue === "perpl" ? "Perps" : "Spot"}
          </button>
        </div>
      </div>
    );
  else
    body = (
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]">
        {market.venue === "perpl" ? (
          <>
            <PerpsOrderForm session={session} market={market.perp} run={app.run} busy={busy} priceHint={priceHint} />
            <AccountCard app={app} session={session} />
          </>
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
          <span className="text-[11px] text-muted">Market orders</span>
        )}
      </div>
      {body}
      <SessionStrip app={app} busy={busy} />
    </Panel>
  );
}
