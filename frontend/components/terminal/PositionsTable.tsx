"use client";

import { usePoll } from "@/hooks/usePoll";
import { formatPrice, formatUsd } from "@/lib/format";
import { closePosition, getAccount, getPosition, liquidationPrice, type PerpMarket, type Position } from "@/lib/perpl";
import type { StealthSession, Step } from "@/lib/session";

type Run = (job: (onStep: (s: Step) => void) => Promise<string>) => Promise<void>;

const CNS = 1e6;

type Open = { market: PerpMarket; position: Position };

const toPrice = (m: PerpMarket, pns: bigint) => Number(pns) / 10 ** m.priceDecimals;
const toSize = (m: PerpMarket, lots: bigint) => Number(lots) / 10 ** m.sizeDecimals;
const fmtSize = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 5 });
const money = (cns: bigint) => Number(cns) / CNS;

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatUsd(Math.abs(value))}`;
}

function derive(item: Open) {
  const { market, position: p } = item;
  const size = toSize(market, p.sizeLots);
  const mark = toPrice(market, p.markPNS);
  const liq = liquidationPrice(market, p);
  const pnl = money(p.pnlCNS);
  const margin = money(p.marginCNS);
  const roe = margin > 0 ? (pnl / margin) * 100 : 0;
  return {
    size,
    mark,
    notional: size * mark,
    entry: toPrice(market, p.entryPNS),
    liq: Number.isFinite(liq) && liq > 0 ? `$${formatPrice(liq)}` : "—",
    margin,
    pnl,
    pnlText: `${signed(pnl)} (${roe >= 0 ? "+" : ""}${roe.toFixed(2)}%)`,
    tone: pnl >= 0 ? "text-success" : "text-danger",
    sideTone: p.side === "long" ? "text-success" : "text-danger",
    sideLabel: p.side === "long" ? "Long" : "Short",
  };
}

const closeBtn =
  "h-7 rounded-md border border-border px-2.5 text-xs text-text transition-colors hover:border-faint hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50";

function Empty({ children }: { children: string }) {
  return <p className="px-3 py-8 text-center text-xs text-muted">{children}</p>;
}

export function PositionsTable({
  session,
  markets,
  run,
  busy,
  onSelectMarket,
}: {
  session: StealthSession | null;
  markets: PerpMarket[];
  run: Run;
  busy: boolean;
  onSelectMarket?: (perpId: number) => void;
}) {
  const owner = session?.burner.address ?? null;
  const account = usePoll(owner ? () => getAccount(owner) : null, 3000, owner ?? "").data;
  const accountId = account?.id ?? null;
  const { data } = usePoll<Open[]>(
    accountId !== null && markets.length > 0
      ? async () => {
          const found = await Promise.all(markets.map(async (market) => ({ market, position: await getPosition(market.id, accountId) })));
          return found.flatMap((f) => (f.position ? [{ market: f.market, position: f.position }] : []));
        }
      : null,
    3000,
    `${owner ?? ""}:${accountId ?? ""}:${markets.length}`,
  );

  if (!session) return <Empty>Enter Stealth Mode to trade. Positions from your burner wallet appear here.</Empty>;
  if (data === null) {
    return (
      <p className="px-3 py-8 text-center text-xs text-muted" aria-busy="true">
        Loading positions…
      </p>
    );
  }
  if (data.length === 0) return <Empty>No open positions</Empty>;

  const close = (item: Open) =>
    run(async (onStep) => {
      onStep({ index: 1, total: 1, label: `Closing ${item.market.symbol} position` });
      await closePosition(session.burner.wallet, item.market, item.position);
      return `Closed ${item.market.symbol} ${item.position.side}`;
    });

  const headers = ["Market", "Size", "Notional", "Entry", "Mark", "Liq. price", "Margin", "PnL (ROE%)", ""];

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-[11px] text-faint">
              {headers.map((h, i) => (
                <th key={i} scope="col" className={`h-8 px-3 font-normal ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const d = derive(item);
              return (
                <tr key={item.market.id} className="h-10 border-b border-border hover:bg-surface-2">
                  <td className="px-3">
                    <button
                      type="button"
                      onClick={() => onSelectMarket?.(item.market.id)}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      {item.market.symbol}
                      <span className={`text-[11px] ${d.sideTone}`}>{d.sideLabel}</span>
                    </button>
                  </td>
                  <td className={`px-3 text-right font-mono tabular ${d.sideTone}`}>{fmtSize(d.size)}</td>
                  <td className="px-3 text-right font-mono tabular">{formatUsd(d.notional)}</td>
                  <td className="px-3 text-right font-mono tabular">${formatPrice(d.entry)}</td>
                  <td className="px-3 text-right font-mono tabular">${formatPrice(d.mark)}</td>
                  <td className="px-3 text-right font-mono tabular">{d.liq}</td>
                  <td className="px-3 text-right font-mono tabular">{formatUsd(d.margin)}</td>
                  <td className={`px-3 text-right font-mono tabular ${d.tone}`}>{d.pnlText}</td>
                  <td className="px-3 text-right">
                    <button type="button" className={closeBtn} disabled={busy} onClick={() => close(item)} aria-label={`Market close ${item.market.symbol} position`}>
                      Market close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {data.map((item) => {
          const d = derive(item);
          return (
            <li key={item.market.id} className="px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => onSelectMarket?.(item.market.id)} className="flex items-center gap-2 text-[13px] font-medium">
                  {item.market.symbol}
                  <span className={`text-[11px] ${d.sideTone}`}>{d.sideLabel}</span>
                </button>
                <span className={`font-mono text-xs tabular ${d.tone}`}>{d.pnlText}</span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                {[
                  ["Size", fmtSize(d.size)],
                  ["Notional", formatUsd(d.notional)],
                  ["Margin", formatUsd(d.margin)],
                  ["Entry", `$${formatPrice(d.entry)}`],
                  ["Mark", `$${formatPrice(d.mark)}`],
                  ["Liq.", d.liq],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-faint">{k}</dt>
                    <dd className="font-mono tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              <button type="button" className={`${closeBtn} mt-2.5 w-full`} disabled={busy} onClick={() => close(item)} aria-label={`Market close ${item.market.symbol} position`}>
                Market close
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
