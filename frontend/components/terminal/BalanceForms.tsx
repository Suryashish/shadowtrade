"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import type { ShadowTrade } from "@/hooks/useShadowTrade";
import { TOKENS, type Venue } from "@/lib/config";

// Testnet collateral is admin-minted by each venue; there is no public faucet.
const TOKEN_SOURCES: Record<Venue, { hint: string; cta: string; url: string }> = {
  perpl: { hint: "AUSD is Perpl's collateral token. Testnet AUSD is distributed by the Perpl team.", cta: "Get AUSD from Perpl", url: "https://testnet.perpl.xyz" },
  kuru: { hint: "Spot trades settle in USDC. Kuru's testnet USDC is distributed by the Kuru team.", cta: "Get testnet USDC from Kuru", url: "https://docs.kuru.io/deployments/setup" },
};

/** Digits and a single dot, capped at 2 decimal places. */
function cleanAmount(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
}

const fmtAmount = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

function AmountInput({ value, onChange, unit, max }: { value: string; onChange: (v: string) => void; unit: string; max: number }) {
  return (
    <div>
      <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 focus-within:border-accent">
        <span className="text-xs text-faint">Amount</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(cleanAmount(e.target.value))}
          placeholder="0.00"
          aria-label="Amount"
          className="tabular min-w-0 flex-1 bg-transparent text-right font-mono text-sm outline-none placeholder:text-faint"
        />
        <span className="text-xs text-muted">{unit}</span>
      </label>
      <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
        <span className="tabular">Available {max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <div className="flex gap-1">
          {[1000, 5000].map((v) => (
            <button
              key={v}
              type="button"
              disabled={v > max}
              onClick={() => onChange(String(v))}
              className="rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
            >
              {v.toLocaleString()}
            </button>
          ))}
          <button type="button" onClick={() => onChange(String(Math.floor(max * 100) / 100))} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-text">
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
      className="h-9 w-full rounded-md bg-accent text-[13px] font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-surface-2 disabled:text-muted"
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
  if (app.balancesLoaded && max === 0) {
    return (
      <div className="rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed">
        <p className="font-medium">No {token.symbol} in this wallet yet</p>
        <p className="mt-1 text-muted">{TOKEN_SOURCES[venue].hint}</p>
        <a href={TOKEN_SOURCES[venue].url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-accent hover:underline">
          {TOKEN_SOURCES[venue].cta} ↗
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <AmountInput value={amount} onChange={setAmount} unit={token.symbol} max={max} />
      <p className="h-3 text-[11px] leading-none text-warning">{odd ? "Odd amounts are easier to trace. Round numbers blend in." : ""}</p>
      <SubmitButton
        label={problem ?? `Deposit ${fmtAmount(value)} ${token.symbol}`}
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
        : !to
          ? "Enter a recipient address"
          : !isAddress(to)
            ? "Invalid address"
            : null;
  const badAddress = to !== "" && !isAddress(to);
  return (
    <div className="space-y-2">
      <AmountInput value={amount} onChange={setAmount} unit={token.symbol} max={max} />
      <label className={`flex h-9 items-center gap-2 rounded-md border bg-surface-2 px-3 ${badAddress ? "border-danger" : "border-border focus-within:border-accent"}`}>
        <span className="text-xs text-faint">To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder="0x… (a fresh address is most private)"
          spellCheck={false}
          aria-label="Recipient address"
          aria-invalid={badAddress}
          className="min-w-0 flex-1 bg-transparent text-right font-mono text-xs outline-none placeholder:text-faint"
        />
      </label>
      <p role={badAddress ? "alert" : undefined} className="h-3 text-[11px] leading-none text-danger">
        {badAddress ? "Not a valid address" : ""}
      </p>
      <SubmitButton
        label={problem ?? `Withdraw ${fmtAmount(value)} ${token.symbol}`}
        disabled={!!problem}
        onClick={() => {
          app.withdraw(venue, value, to as Address);
          setAmount("");
        }}
      />
    </div>
  );
}
