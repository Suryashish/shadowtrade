"use client";

import { useState } from "react";
import { perpInfo, SPOT_TERMINAL_MARKETS, useCandles, useMarketStats, useOrderBook, useTrades, type TerminalMarket } from "@/hooks/useMarketData";
import { useShadowTrade, type ShadowTrade } from "@/hooks/useShadowTrade";
import { useWallet, type WalletState } from "@/hooks/useWallet";
import type { Venue } from "@/lib/config";
import type { MarketStats, OrderBook as OrderBookData, Resolution } from "@/lib/market";
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

function BookAndTrades({ market, book }: { market: TerminalMarket; book: OrderBookData | null }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
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

type MobileView = "chart" | "book" | "trade" | "positions";

const MOBILE_VIEWS: { value: MobileView; label: string }[] = [
  { value: "chart", label: "Chart" },
  { value: "book", label: "Book" },
  { value: "trade", label: "Trade" },
  { value: "positions", label: "Positions" },
];

function TerminalBody({
  app,
  wallet,
  market,
  list,
  stats,
  marketStats,
  venue,
  onVenueChange,
  onSelect,
  onSelectPerp,
}: {
  app: ShadowTrade;
  wallet: WalletState;
  market: TerminalMarket;
  list: TerminalMarket[];
  stats: Map<string, MarketStats | null>;
  marketStats: MarketStats | null;
  venue: Venue;
  onVenueChange: (v: Venue) => void;
  onSelect: (key: string) => void;
  onSelectPerp: (perpId: number) => void;
}) {
  const [view, setView] = useState<MobileView>("chart");
  const book = useOrderBook(market);
  const mid = book?.bids[0] && book.asks[0] ? (book.bids[0].price + book.asks[0].price) / 2 : null;
  // Below lg one panel shows at a time; on desktop the grid shows them all.
  const pane = (v: MobileView) => (view === v ? "flex" : "hidden lg:flex");

  return (
    <>
      <MarketBar
        markets={list.map((m) => ({ info: m.info, stats: stats.get(m.info.key) ?? null }))}
        selected={market.info}
        stats={marketStats}
        midPrice={mid}
        onSelect={onSelect}
        venue={venue}
        onVenueChange={onVenueChange}
      />
      <nav aria-label="Terminal views" className="sticky top-0 z-20 grid grid-cols-4 gap-1 border-b border-border bg-bg/95 p-1 backdrop-blur lg:hidden">
        {MOBILE_VIEWS.map((v) => (
          <button
            key={v.value}
            onClick={() => setView(v.value)}
            aria-pressed={view === v.value}
            className={`h-9 rounded-md text-xs font-medium transition-colors ${view === v.value ? "bg-surface text-text shadow-card" : "text-muted"}`}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <main className="flex flex-1 flex-col gap-1 p-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_288px_320px] lg:grid-rows-[minmax(0,1fr)_272px]">
        <div className={`${pane("chart")} h-[max(480px,calc(100dvh-170px))] flex-col lg:col-start-1 lg:row-start-1 lg:h-auto lg:min-h-0`}>
          <ChartPanel key={market.info.key} market={market} />
        </div>
        <div className={`${pane("trade")} flex-col lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:min-h-0`}>
          <OrderPanel app={app} wallet={wallet} market={market} priceHint={marketStats?.mark ?? marketStats?.price ?? null} onSwitchVenue={onVenueChange} />
        </div>
        <div className={`${pane("book")} h-[max(480px,calc(100dvh-170px))] flex-col lg:col-start-2 lg:row-start-1 lg:h-auto lg:min-h-0`}>
          <BookAndTrades key={market.info.key} market={market} book={book} />
        </div>
        <div className={`${pane("positions")} h-[max(480px,calc(100dvh-170px))] flex-col lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:h-auto lg:min-h-0`}>
          <BottomPanel key={app.session?.venue ?? "none"} app={app} onSelectPerp={onSelectPerp} />
        </div>
      </main>
    </>
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
      {app.resumable && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-accent/30 bg-accent-soft px-3 py-2 text-xs">
          <span>
            <span className="font-medium text-text">You have a stealth session in progress.</span>{" "}
            <span className="text-muted">It&apos;s saved encrypted on this device. Sign to resume it.</span>
          </span>
          <button onClick={app.unlock} className="h-7 rounded-md bg-accent px-3 font-medium text-accent-text hover:bg-accent-hover">
            Sign to resume
          </button>
        </div>
      )}
      {market ? (
        <TerminalBody
          app={app}
          wallet={wallet}
          market={market}
          list={list}
          stats={stats}
          marketStats={marketStats}
          venue={venue}
          onVenueChange={setVenue}
          onSelect={select}
          onSelectPerp={selectPerp}
        />
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
