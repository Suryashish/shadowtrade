"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type AutoscaleInfo,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { RESOLUTIONS, type Candle, type Resolution } from "@/lib/market";
import { Spinner } from "@/components/ui";

type Ohlc = { open: number; high: number; low: number; close: number };

type Palette = {
  success: string;
  danger: string;
  grid: string;
  muted: string;
  border: string;
  surface: string;
};

// Fitting every loaded candle into a narrow chart leaves ~2px bars whose red/green wicks blur to
// grey, so show the most recent candles at a readable spacing; older ones stay a scroll away.
const READABLE_BAR_PX = 7;

function showRecent(chart: IChartApi, count: number, width: number) {
  const bars = Math.max(20, Math.floor(width / READABLE_BAR_PX));
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - bars), to: count + 4 });
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    success: get("--success", "#22c983"),
    danger: get("--danger", "#f6465d"),
    grid: get("--chart-grid", "#1c2029"),
    muted: get("--muted", "#8e95a2"),
    border: get("--border", "#1c2029"),
    surface: get("--surface", "#0f1115"),
  };
}

/** Append an alpha channel to a #rrggbb color; other formats pass through unchanged. */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${color}${a}`;
}

function toCandleData(c: Candle): CandlestickData<UTCTimestamp> {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

function toVolumeData(c: Candle, p: Palette): HistogramData<UTCTimestamp> {
  return {
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: withAlpha(c.close >= c.open ? p.success : p.danger, 0.35),
  };
}

function applyTheme(
  chart: IChartApi,
  candles: ISeriesApi<"Candlestick">,
  p: Palette,
): void {
  chart.applyOptions({
    layout: {
      background: { color: "transparent" },
      textColor: p.muted,
      fontSize: 11,
      attributionLogo: false,
    },
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { style: LineStyle.Dashed, color: p.muted, labelBackgroundColor: p.muted },
      horzLine: { style: LineStyle.Dashed, color: p.muted, labelBackgroundColor: p.muted },
    },
    rightPriceScale: { borderColor: p.border },
    timeScale: { borderColor: p.border },
  });
  candles.applyOptions({
    upColor: p.success,
    downColor: p.danger,
    borderUpColor: p.success,
    borderDownColor: p.danger,
    wickUpColor: p.success,
    wickDownColor: p.danger,
  });
}

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function PriceChart({
  candles,
  resolution,
  onResolutionChange,
  priceDecimals,
  loading,
  error,
  marketKey,
}: {
  candles: Candle[];
  resolution: Resolution;
  onResolutionChange: (r: Resolution) => void;
  priceDecimals: number;
  loading: boolean;
  error?: string | null;
  marketKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const lastCloseRef = useRef(0);
  const interactedRef = useRef(false);
  const prevRef = useRef<{ key: string; res: Resolution; len: number; last: number } | null>(null);
  const [hover, setHover] = useState<Ohlc | null>(null);

  // Create the chart once; keep colors in sync with the color scheme.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const palette = readPalette();
    paletteRef.current = palette;
    const chart = createChart(el, {
      autoSize: true,
      layout: { fontFamily: "var(--font-mono), ui-monospace, monospace" },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      leftPriceScale: { visible: false },
      rightPriceScale: {
        visible: true,
        entireTextOnly: true,
        minimumWidth: 64,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      priceScaleId: "right",
      priceLineVisible: true,
      lastValueVisible: true,
      upColor: palette.success,
      downColor: palette.danger,
      borderVisible: true,
      borderUpColor: palette.success,
      borderDownColor: palette.danger,
      wickUpColor: palette.success,
      wickDownColor: palette.danger,
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
        const r = original();
        const last = lastCloseRef.current;
        if (!r || !r.priceRange || !(last > 0)) return r;
        const lo = last * 0.995;
        const hi = last * 1.005;
        return {
          ...r,
          priceRange: {
            minValue: Math.min(r.priceRange.minValue, lo),
            maxValue: Math.max(r.priceRange.maxValue, hi),
          },
        };
      },
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({
      visible: false,
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    applyTheme(chart, candleSeries, palette);
    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    prevRef.current = null;

    const onMove = (param: MouseEventParams<Time>) => {
      const d = param.seriesData.get(candleSeries);
      if (param.point && d && "open" in d) {
        setHover({ open: d.open, high: d.high, low: d.low, close: d.close });
      } else {
        setHover(null);
      }
    };
    chart.subscribeCrosshairMove(onMove);

    // Refit on container resize unless the user has panned/zoomed manually.
    const markInteracted = () => {
      interactedRef.current = true;
    };
    el.addEventListener("pointerdown", markInteracted);
    el.addEventListener("wheel", markInteracted, { passive: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!interactedRef.current) showRecent(chart, prevRef.current?.len ?? 0, el.clientWidth);
      }, 150);
    });
    ro.observe(el);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      // Wait a frame so the CSS variables for the new scheme are applied.
      requestAnimationFrame(() => {
        const next = readPalette();
        const prev = paletteRef.current;
        paletteRef.current = next;
        applyTheme(chart, candleSeries, next);
        if (prev && (prev.success !== next.success || prev.danger !== next.danger)) {
          prevRef.current = null; // force volume recolor on next data sync
        }
      });
    };
    mq.addEventListener("change", onScheme);

    return () => {
      mq.removeEventListener("change", onScheme);
      ro.disconnect();
      clearTimeout(timer);
      el.removeEventListener("pointerdown", markInteracted);
      el.removeEventListener("wheel", markInteracted);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: { type: "price", precision: priceDecimals, minMove: 10 ** -priceDecimals },
    });
  }, [priceDecimals]);

  // Sync data: full setData on market/resolution change, incremental update otherwise.
  useEffect(() => {
    const chart = chartRef.current;
    const cs = candleRef.current;
    const vs = volumeRef.current;
    const p = paletteRef.current;
    if (!chart || !cs || !vs || !p) return;
    const prev = prevRef.current;
    const len = candles.length;
    const lastC = len > 0 ? candles[len - 1] : null;
    lastCloseRef.current = lastC ? lastC.close : 0;
    const sameSeries = prev !== null && prev.key === marketKey && prev.res === resolution;

    if (sameSeries && lastC && len > 0 && (len === prev.len || len === prev.len + 1) && lastC.time >= prev.last) {
      cs.update(toCandleData(lastC));
      vs.update(toVolumeData(lastC, p));
    } else {
      cs.setData(candles.map((c) => toCandleData(c)));
      vs.setData(candles.map((c) => toVolumeData(c, p)));
      if (len > 0 && (!prev || prev.key !== marketKey || prev.res !== resolution || prev.len === 0)) {
        interactedRef.current = false;
        showRecent(chart, len, containerRef.current?.clientWidth ?? 600);
      }
    }
    prevRef.current = { key: marketKey, res: resolution, len, last: lastC ? lastC.time : 0 };
  }, [candles, resolution, marketKey]);

  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const shown: Ohlc | null = hover ?? lastCandle;
  const change = shown && shown.open !== 0 ? ((shown.close - shown.open) / shown.open) * 100 : null;
  const up = shown ? shown.close >= shown.open : true;
  const tone = up ? "text-success" : "text-danger";

  const thin = candles.length > 0 && candles.filter((c) => c.volume > 0).length < 5;
  const empty = !loading && !error && candles.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        {RESOLUTIONS.map((r) => (
          <button
            key={r.seconds}
            type="button"
            onClick={() => onResolutionChange(r.seconds)}
            className={`rounded px-2 py-1 text-[12px] font-medium transition-colors ${
              r.seconds === resolution ? "bg-surface-2 text-text" : "text-muted hover:text-text"
            }`}
          >
            {r.label}
          </button>
        ))}
        <div className="ml-auto flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px] tabular-nums text-muted">
          {shown && (
            <>
              <span className="hidden xl:inline">
                O <span className="text-text">{fmt(shown.open, priceDecimals)}</span>
              </span>
              <span className="hidden xl:inline">
                H <span className="text-text">{fmt(shown.high, priceDecimals)}</span>
              </span>
              <span className="hidden xl:inline">
                L <span className="text-text">{fmt(shown.low, priceDecimals)}</span>
              </span>
              <span className="truncate">
                C <span className={tone}>{fmt(shown.close, priceDecimals)}</span>
              </span>
              {change !== null && (
                <span className={tone}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {thin && !loading && !error && (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-surface-2/80 px-2 py-1 text-[11px] text-faint">
            Thin market · few trades in this range
          </div>
        )}
        {(loading || error || empty) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {error ? (
              <p className="max-w-xs text-center text-[12px] text-muted">{error}</p>
            ) : loading ? (
              <Spinner className="size-5 text-muted" />
            ) : (
              <p className="text-[12px] text-muted">No trades in this range yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
