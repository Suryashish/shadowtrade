"use client";

import { usePoll } from "@/hooks/usePoll";
import { closePosition, getAccount, getPosition, liquidationPrice, type PerpMarket, type Position } from "@/lib/perpl";
import type { StealthSession, Step } from "@/lib/session";
import { EmptyIcons, EmptyState, SkeletonRows } from "./Panel";

type Run = (job: (onStep: (s: Step) => void) => Promise<string>) => Promise<void>;

const CNS = 1e6;

type Open = { market: PerpMarket; position: Position };

const toPrice = (m: PerpMarket, pns: bigint) => Number(pns) / 10 ** m.priceDecimals;
const toSize = (m: PerpMarket, lots: bigint) => Number(lots) / 10 ** m.sizeDecimals;
const fmtSize = (n: number, dp: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: Math.min(dp, 8) });
const fmtPrice = (n: number, dp: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const formatUsd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    sizeText: fmtSize(size, market.sizeDecimals),
    markText: fmtPrice(mark, market.priceDecimals),
    entryText: fmtPrice(toPrice(market, p.entryPNS), market.priceDecimals),
    mark,
    notional: size * mark,
    liq: Number.isFinite(liq) && liq > 0 ? fmtPrice(liq, market.priceDecimals) : "—",
    margin,
    pnl,
    pnlText: `${signed(pnl)} (${roe >= 0 ? "+" : ""}${roe.toFixed(2)}%)`,
    tone: pnl >= 0 ? "text-success" : "text-danger",
    sideTone: p.side === "long" ? "text-success" : "text-danger",
    sidePill: p.side === "long" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
    sideLabel: p.side === "long" ? "Long" : "Short",
  };
}

const closeBtn =
  "h-7 rounded border border-border-strong px-2.5 text-xs font-medium text-text transition-colors hover:border-faint hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50";

function SidePill({ tone, children }: { tone: string; children: string }) {
  return <span className={`rounded-sm px-1.5 py-px text-[11px] font-medium ${tone}`}>{children}</span>;
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

  if (!session) {
    return <EmptyState icon={EmptyIcons.shield} title="No open positions" body="Enter Stealth Mode in the order panel to trade from a fresh wallet." />;
  }
  if (data === null) return <SkeletonRows rows={3} label="Loading positions" />;
  if (data.length === 0) return <EmptyState title="No open positions" body="Your positions on Perpl appear here." />;

  const close = (item: Open) =>
    run(async (onStep) => {
      onStep({ index: 1, total: 1, label: `Closing ${item.market.symbol} position` });
      await closePosition(session.burner.wallet, item.market, item.position);
      return `Closed ${item.market.symbol} ${item.position.side}`;
    });

  const headers = ["Market", "Size", "Notional", "Entry", "Mark", "Liq. price", "Margin", "PnL (ROE%)", ""];
  const hideBelowXl = (i: number) => (i === 2 || i === 6 ? "hidden xl:table-cell" : "");
  const rows = data.map(derive);
  const totalNotional = rows.reduce((a, d) => a + d.notional, 0);
  const totalMargin = rows.reduce((a, d) => a + d.margin, 0);
  const totalPnl = rows.reduce((a, d) => a + d.pnl, 0);
  const totalTone = totalPnl >= 0 ? "text-success" : "text-danger";

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-faint">
              {headers.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`h-8 px-3 font-normal ${i > 0 ? "text-right" : ""} ${hideBelowXl(i)} ${i === 8 ? "sticky right-0 border-l border-border bg-surface" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const d = derive(item);
              return (
                <tr key={item.market.id} className="group h-10 border-b border-border hover:bg-surface-2">
                  <td className="px-3">
                    <button
                      type="button"
                      onClick={() => onSelectMarket?.(item.market.id)}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      {item.market.symbol}
                      <SidePill tone={d.sidePill}>{d.sideLabel}</SidePill>
                    </button>
                  </td>
                  <td className={`px-3 text-right font-mono tabular ${d.sideTone}`}>{d.sizeText}</td>
                  <td className="hidden px-3 text-right font-mono tabular xl:table-cell">{formatUsd(d.notional)}</td>
                  <td className="px-3 text-right font-mono tabular">{d.entryText}</td>
                  <td className="px-3 text-right font-mono tabular">{d.markText}</td>
                  <td className="px-3 text-right font-mono tabular">{d.liq}</td>
                  <td className="hidden px-3 text-right font-mono tabular xl:table-cell">{formatUsd(d.margin)}</td>
                  <td className={`px-3 text-right font-mono tabular ${d.tone}`}>{d.pnlText}</td>
                  <td className="sticky right-0 border-l border-border bg-surface px-3 text-right group-hover:bg-surface-2">
                    <button type="button" className={closeBtn} disabled={busy} onClick={() => close(item)} aria-label={`Market close ${item.market.symbol} position`}>
                      Market close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="h-9 bg-surface-2 text-[11px]">
              <td className="px-3 font-medium text-muted">Total</td>
              <td />
              <td className="tabular hidden px-3 text-right font-mono text-xs xl:table-cell">{formatUsd(totalNotional)}</td>
              <td />
              <td />
              <td />
              <td className="tabular hidden px-3 text-right font-mono text-xs xl:table-cell">{formatUsd(totalMargin)}</td>
              <td className={`tabular px-3 text-right font-mono text-xs font-medium ${totalTone}`}>{signed(totalPnl)}</td>
              <td className="sticky right-0 border-l border-border bg-surface-2" />
            </tr>
          </tfoot>
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
                  <SidePill tone={d.sidePill}>{d.sideLabel}</SidePill>
                </button>
                <span className={`font-mono text-xs tabular ${d.tone}`}>{d.pnlText}</span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                {[
                  ["Size", d.sizeText],
                  ["Notional", formatUsd(d.notional)],
                  ["Margin", formatUsd(d.margin)],
                  ["Entry", d.entryText],
                  ["Mark", d.markText],
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
      <div className="flex h-9 items-center justify-between gap-3 border-t border-border bg-surface-2 px-3 text-xs md:hidden">
        <span className="font-medium text-muted">Total</span>
        <span className="tabular font-mono text-muted">{formatUsd(totalNotional)}</span>
        <span className={`tabular font-mono font-medium ${totalTone}`}>{signed(totalPnl)}</span>
      </div>
    </>
  );
}
