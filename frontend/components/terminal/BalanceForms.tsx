"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import type { ShadowTrade } from "@/hooks/useShadowTrade";
import { TOKENS, type Venue } from "@/lib/config";

function AmountInput({ value, onChange, unit, max }: { value: string; onChange: (v: string) => void; unit: string; max: number }) {
  return (
    <div>
      <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 focus-within:border-accent">
        <span className="text-xs text-faint">Amount</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.00"
          aria-label="Amount"
          className="tabular min-w-0 flex-1 bg-transparent text-right font-mono text-sm outline-none placeholder:text-faint"
        />
        <span className="text-xs text-muted">{unit}</span>
      </label>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-faint">
        <span className="tabular">Available {max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <div className="flex gap-1">
          {[1000, 5000].map((v) => (
            <button key={v} type="button" onClick={() => onChange(String(v))} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-text">
              {v.toLocaleString()}
            </button>
          ))}
          <button type="button" onClick={() => onChange(String(Math.floor(max)))} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-text">
            Max
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmitButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
    >
      {label}
    </button>
  );
}

export function DepositForm({ app, venue, busy }: { app: ShadowTrade; venue: Venue; busy: boolean }) {
  const [amount, setAmount] = useState("");
  const token = TOKENS[venue];
  const max = Number(app.balances[venue].wallet) / 10 ** token.decimals;
  const value = Number(amount);
  const odd = value > 0 && value % 100 !== 0;
  const problem = busy ? "Working…" : !value ? "Enter an amount" : value > max ? `Not enough ${token.symbol} in wallet` : null;
  return (
    <div className="space-y-2.5">
      <AmountInput value={amount} onChange={setAmount} unit={token.symbol} max={max} />
      {odd && <p className="text-[11px] text-warning">Odd amounts are easier to trace. Round numbers blend in.</p>}
      <SubmitButton
        label={problem ?? `Deposit ${value.toLocaleString()} ${token.symbol}`}
        disabled={!!problem}
        onClick={() => {
          app.deposit(venue, value);
          setAmount("");
        }}
      />
    </div>
  );
}

export function WithdrawForm({ app, venue, busy }: { app: ShadowTrade; venue: Venue; busy: boolean }) {
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const token = TOKENS[venue];
  const max = Number(app.balances[venue].private) / 10 ** token.decimals;
  const value = Number(amount);
  const problem = busy
    ? "Working…"
    : !value
      ? "Enter an amount"
      : value > max
        ? "More than your private balance"
        : !isAddress(to)
          ? "Enter a recipient address"
          : null;
  return (
    <div className="space-y-2.5">
      <AmountInput value={amount} onChange={setAmount} unit={token.symbol} max={max} />
      <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 focus-within:border-accent">
        <span className="text-xs text-faint">To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder="0x… (a fresh address is most private)"
          spellCheck={false}
          aria-label="Recipient address"
          className="min-w-0 flex-1 bg-transparent text-right font-mono text-xs outline-none placeholder:text-faint"
        />
      </label>
      <SubmitButton
        label={problem ?? `Withdraw ${value.toLocaleString()} ${token.symbol}`}
        disabled={!!problem}
        onClick={() => {
          app.withdraw(venue, value, to as Address);
          setAmount("");
        }}
      />
    </div>
  );
}
