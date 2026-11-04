"use client";

import { useState } from "react";
import { perpInfo, SPOT_TERMINAL_MARKETS, useCandles, useMarketStats, useOrderBook, useTrades, type TerminalMarket } from "@/hooks/useMarketData";
import { useShadowTrade } from "@/hooks/useShadowTrade";
import { useWallet } from "@/hooks/useWallet";
import type { Venue } from "@/lib/config";
import type { Resolution } from "@/lib/market";
import { BottomPanel } from "./BottomPanel";
import { MarketBar } from "./MarketBar";
import { OrderBook } from "./OrderBook";
import { OrderPanel } from "./OrderPanel";
import { EmptyState, Panel, PanelTabs } from "./Panel";
import { PriceChart } from "./PriceChart";
import { RecentTrades } from "./RecentTrades";
import { Toast } from "./Toast";
import { TopNav } from "./TopNav";

const DEFAULT_PERP = "ETH";

function BookAndTrades({ market }: { market: TerminalMarket }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  const book = useOrderBook(market);
  const trades = useTrades(market);
  return (
    <Panel className="h-full">
      <PanelTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "book", label: "Order book" },
          { value: "trades", label: "Trades" },
        ]}
      />
      <div className="min-h-0 flex-1">{tab === "book" ? <OrderBook book={book} market={market.info} /> : <RecentTrades trades={trades} market={market.info} />}</div>
    </Panel>
  );
}

function ChartPanel({ market }: { market: TerminalMarket }) {
  const [resolution, setResolution] = useState<Resolution>(300);
  const { candles, error } = useCandles(market, resolution);
  return (
    <Panel className="h-full">
      <PriceChart
        candles={candles ?? []}
        loading={candles === null && !error}
        error={error}
        resolution={resolution}
        onResolutionChange={setResolution}
        priceDecimals={market.info.priceDecimals}
        marketKey={market.info.key}
      />
    </Panel>
  );
}

export function Terminal() {
  const wallet = useWallet();
  const app = useShadowTrade(wallet.wallet);
  const [venue, setVenue] = useState<Venue>("perpl");
  const [selected, setSelected] = useState<Record<Venue, string | null>>({ perpl: null, kuru: SPOT_TERMINAL_MARKETS[0].info.key });

  const perpMarkets: TerminalMarket[] = app.markets.map((perp) => ({ info: perpInfo(perp), venue: "perpl", perp }));
  const list = venue === "perpl" ? perpMarkets : SPOT_TERMINAL_MARKETS;
  const fallbackKey = venue === "perpl" ? perpMarkets.find((m) => m.info.base === DEFAULT_PERP)?.info.key : SPOT_TERMINAL_MARKETS[0].info.key;
  const market = list.find((m) => m.info.key === (selected[venue] ?? fallbackKey)) ?? list[0] ?? null;

  const stats = useMarketStats(app.markets);
  const marketStats = market ? stats.get(market.info.key) ?? null : null;

  const select = (key: string) => setSelected((s) => ({ ...s, [venue]: key }));
  const selectPerp = (perpId: number) => {
    setVenue("perpl");
    setSelected((s) => ({ ...s, perpl: `perpl:${perpId}` }));
  };

  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh]">
      <TopNav wallet={wallet} app={app} />
      {market ? (
        <>
          <MarketBar
            markets={list.map((m) => ({ info: m.info, stats: stats.get(m.info.key) ?? null }))}
            selected={market.info}
            stats={marketStats}
            onSelect={select}
            venue={venue}
            onVenueChange={setVenue}
          />
          <main className="flex flex-1 flex-col gap-1 p-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_288px_320px] lg:grid-rows-[minmax(0,1fr)_272px]">
            <div className="h-[420px] lg:col-start-1 lg:row-start-1 lg:h-auto lg:min-h-0">
              <ChartPanel key={market.info.key} market={market} />
            </div>
            <div className="lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:min-h-0">
              <OrderPanel app={app} wallet={wallet} market={market} priceHint={marketStats?.mark ?? marketStats?.price ?? null} onSwitchVenue={setVenue} />
            </div>
            <div className="h-[460px] lg:col-start-2 lg:row-start-1 lg:h-auto lg:min-h-0">
              <BookAndTrades key={market.info.key} market={market} />
            </div>
            <div className="h-[360px] lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:h-auto lg:min-h-0">
              <BottomPanel app={app} onSelectPerp={selectPerp} />
            </div>
          </main>
        </>
      ) : (
        <div className="grid flex-1 place-items-center">
          {app.marketsError ? (
            <EmptyState
              title="Markets didn't load"
              body={app.marketsError}
              action={
                <button onClick={app.reloadMarkets} className="h-9 rounded-lg border border-border-strong px-4 text-xs font-medium hover:bg-surface-2">
                  Retry
                </button>
              }
            />
          ) : (
            <p className="text-sm text-muted">Loading markets…</p>
          )}
        </div>
      )}
      <Toast activity={app.activity} onDismiss={app.clearActivity} />
    </div>
  );
}
