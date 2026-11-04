"use client";

import { formatUnits } from "viem";
import { usePoll } from "@/hooks/usePoll";
import { SPOT_MARKETS, TOKENS } from "@/lib/config";
import { formatToken, formatUsd } from "@/lib/format";
import * as kuru from "@/lib/kuru";
import type { StealthSession, Step } from "@/lib/session";
import type { SpotMarket } from "@/lib/config";
import { EmptyIcons, EmptyState, SkeletonRows } from "./Panel";

type Run = (job: (onStep: (s: Step) => void) => Promise<string>) => Promise<void>;

const USDC = TOKENS.kuru;

type Holdings = { usdc: bigint; bases: bigint[]; bids: (number | null)[] };

export function SpotHoldings({ session, run, busy = false }: { session: StealthSession | null; run?: Run; busy?: boolean }) {
  const owner = session?.burner.address ?? null;
  const { data } = usePoll<Holdings>(
    owner
      ? async () => {
          const id = await kuru.accountId(owner);
          const [usdc, ...bases] = await Promise.all([kuru.balanceOf(id, USDC.address), ...SPOT_MARKETS.map((m) => kuru.balanceOf(id, m.baseToken))]);
          const bids = await Promise.all(SPOT_MARKETS.map((m, i) => (bases[i] > 0n ? kuru.bestBidAsk(m).then((b) => b.bid) : Promise.resolve(null))));
          return { usdc, bases, bids };
        }
      : null,
    3000,
    owner ?? "",
  );

  if (!session) return <EmptyState icon={EmptyIcons.wallet} title="No spot holdings" body="Enter Stealth Mode in the order panel to trade from a fresh wallet." />;
  if (data === null) return <SkeletonRows rows={3} label="Loading holdings" />;

  const sell = (market: SpotMarket, held: bigint) => {
    if (!run) return;
    const amount = kuru.floorToLot(market, held);
    void run(async (onStep) => {
      onStep({ index: 1, total: 1, label: "Selling on Kuru" });
      const q = await kuru.swap(session.burner.wallet, market, false, amount);
      return `Sold ${formatToken(q.amountIn, market.baseDecimals, 6)} ${market.base} for ${formatToken(q.amountOut, USDC.decimals, 2)} USDC`;
    });
  };

  const rows: { asset: string; balance: string; value: string; sell?: () => void }[] = [
    { asset: USDC.symbol, balance: formatToken(data.usdc, USDC.decimals, 2), value: formatUsd(Number(formatUnits(data.usdc, USDC.decimals))) },
    ...SPOT_MARKETS.flatMap((m, i) => {
      const held = data.bases[i];
      if (held === 0n) return [];
      const bid = data.bids[i];
      return [
        {
          asset: m.base,
          balance: formatToken(held, m.baseDecimals, 6),
          value: bid !== null ? formatUsd(Number(formatUnits(held, m.baseDecimals)) * bid) : "—",
          sell: () => sell(m, held),
        },
      ];
    }),
  ];

  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[11px] text-faint">
            <th scope="col" className="h-8 px-3 text-left font-normal">
              Asset
            </th>
            <th scope="col" className="h-8 px-3 text-right font-normal">
              Balance
            </th>
            <th scope="col" className="h-8 px-3 text-right font-normal">
              Est. value
            </th>
            <th scope="col" className="h-8 w-20 px-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.asset} className="h-10 border-b border-border hover:bg-surface-2">
              <td className="px-3 font-medium">{r.asset}</td>
              <td className="px-3 text-right font-mono tabular">{r.balance}</td>
              <td className="px-3 text-right font-mono tabular">{r.value}</td>
              <td className="px-3 text-right">
                {r.sell && run && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={r.sell}
                    aria-label={`Sell ${r.asset} for USDC`}
                    className="h-7 rounded-md border border-border px-2.5 text-xs text-text transition-colors hover:border-faint hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sell
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-3 text-xs text-faint">Exit Stealth sells everything back to USDC automatically.</p>
    </div>
  );
}
