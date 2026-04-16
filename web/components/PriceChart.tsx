"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/mockData";

type Props = {
  candles: Candle[];
  lastPrice: number;
};

export function PriceChart({ candles, lastPrice }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8E8E9A",
        fontFamily:
          'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(30,30,42,0.6)" },
        horzLines: { color: "rgba(30,30,42,0.6)" },
      },
      rightPriceScale: {
        borderColor: "#1E1E2A",
        scaleMargins: { top: 0.1, bottom: 0.28 },
        textColor: "#8E8E9A",
      },
      timeScale: {
        borderColor: "#1E1E2A",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#2A2A3A", width: 1, style: 2, labelBackgroundColor: "#1E1E2A" },
        horzLine: { color: "#2A2A3A", width: 1, style: 2, labelBackgroundColor: "#1E1E2A" },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00FF88",
      downColor: "#FF3B5C",
      borderUpColor: "#00FF88",
      borderDownColor: "#FF3B5C",
      wickUpColor: "#00FF88",
      wickDownColor: "#FF3B5C",
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    // Volume histogram on overlay scale, scaled to bottom ~22%
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "#00FF88",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color:
          c.close >= c.open ? "rgba(0,255,136,0.55)" : "rgba(255,59,92,0.55)",
      })),
    );

    // Dashed current-price line using a price line on the candle series
    candleSeries.createPriceLine({
      price: lastPrice,
      color: "#00FF88",
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: "",
    });

    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [candles, lastPrice]);

  return (
    <>
      <div ref={hostRef} className="absolute inset-0" />

      {/* Price pill — floating badge, top-right, matches Robinhood Legend */}
      <div className="absolute top-3 right-3 pointer-events-none flex items-center gap-1.5 px-2 h-6 rounded bg-accent/15 border border-accent/45 shadow-glow">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-live" />
        <span className="font-mono num text-[11px] font-semibold text-accent">
          {lastPrice.toFixed(1)}¢
        </span>
      </div>
    </>
  );
}
