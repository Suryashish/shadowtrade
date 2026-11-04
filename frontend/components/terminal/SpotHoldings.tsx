"use client";

import { formatUnits } from "viem";
import { usePoll } from "@/hooks/usePoll";
import { SPOT_MARKETS, TOKENS } from "@/lib/config";
import { formatToken, formatUsd } from "@/lib/format";
import * as kuru from "@/lib/kuru";
import type { StealthSession } from "@/lib/session";

const USDC = TOKENS.kuru;

type Holdings = { usdc: bigint; bases: bigint[]; bids: (number | null)[] };

function Empty({ children }: { children: string }) {
  return <p className="px-3 py-8 text-center text-xs text-muted">{children}</p>;
}

export function SpotHoldings({ session }: { session: StealthSession | null }) {
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

  if (!session) return <Empty>Enter Stealth Mode to trade. Holdings from your burner wallet appear here.</Empty>;
  if (data === null) {
    return (
      <p className="px-3 py-8 text-center text-xs text-muted" aria-busy="true">
        Loading holdings…
      </p>
    );
  }

  const rows = [
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
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.asset} className="h-10 border-b border-border hover:bg-surface-2">
              <td className="px-3 font-medium">{r.asset}</td>
              <td className="px-3 text-right font-mono tabular">{r.balance}</td>
              <td className="px-3 text-right font-mono tabular">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-3 text-xs text-faint">Exit Stealth sells everything back to USDC automatically.</p>
    </div>
  );
}
