import { ema, rsi, supertrend } from "./indicators.js";

export type Signal = "buy" | "sell" | "hold";

export type StrategyName = "supertrend" | "ema_rsi";

export interface EmaRsiInput {
  strategy: "ema_rsi";
  closes: number[];
  emaFastPeriod: number;
  emaSlowPeriod: number;
  rsiPeriod: number;
  rsiMaxForBuy: number;
}

export interface SuperTrendInput {
  strategy: "supertrend";
  high: number[];
  low: number[];
  close: number[];
  atrPeriod: number;
  multiplier: number;
}

export type AnyStrategyInput = EmaRsiInput | SuperTrendInput;

/**
 * EMA + RSI: bullish cross and RSI not extended → buy; bearish cross → sell.
 */
export function computeEmaRsi(input: EmaRsiInput): {
  signal: Signal;
  logLine: string;
} {
  const { closes, emaFastPeriod, emaSlowPeriod, rsiPeriod, rsiMaxForBuy } = input;
  if (closes.length < emaSlowPeriod + 2) {
    return { signal: "hold", logLine: "EMA/RSI: warming up" };
  }
  const eF = ema(closes, emaFastPeriod);
  const eS = ema(closes, emaSlowPeriod);
  const rsiSeries = rsi(closes, rsiPeriod);
  const n = closes.length;
  const i = n - 1;
  const prev = n - 2;
  const fastNow = eF[i]!;
  const slowNow = eS[i]!;
  const fastPrev = eF[prev]!;
  const slowPrev = eS[prev]!;
  const rsiNow = rsiSeries[i];

  let signal: Signal = "hold";
  const bullishCross = fastPrev <= slowPrev && fastNow > slowNow;
  const bearishCross = fastPrev >= slowPrev && fastNow < slowNow;

  if (bearishCross) {
    signal = "sell";
  } else if (bullishCross) {
    if (rsiNow != null && rsiNow <= rsiMaxForBuy) signal = "buy";
    else if (rsiNow == null) signal = "buy";
    else signal = "hold";
  }

  const rsiStr = rsiNow == null ? "n/a" : rsiNow.toFixed(1);
  const logLine = `EMA${emaFastPeriod}/${emaSlowPeriod} RSI=${rsiStr} (max buy ${rsiMaxForBuy})`;
  return { signal, logLine };
}

/**
 * SuperTrend: buy on flip to uptrend, sell on flip to downtrend (closed bars).
 */
export function computeSuperTrend(input: SuperTrendInput): {
  signal: Signal;
  logLine: string;
} {
  const { high, low, close, atrPeriod, multiplier } = input;
  const n = close.length;
  if (n !== high.length || n !== low.length) {
    return { signal: "hold", logLine: "SuperTrend: length mismatch" };
  }
  if (n < atrPeriod + 1) {
    return { signal: "hold", logLine: "SuperTrend: warming up" };
  }

  const { direction, line } = supertrend(
    high,
    low,
    close,
    atrPeriod,
    multiplier
  );
  const i = n - 1;
  const j = n - 2;
  const dNow = direction[i];
  const dPrev = direction[j];
  if (dNow == null || dPrev == null) {
    return { signal: "hold", logLine: "SuperTrend: not ready" };
  }

  let signal: Signal = "hold";
  if (dNow === 1 && dPrev === -1) {
    signal = "buy";
  } else if (dNow === -1 && dPrev === 1) {
    signal = "sell";
  }

  const stLine = line[i];
  const stStr = stLine == null ? "n/a" : stLine.toFixed(2);
  const dirStr = dNow === 1 ? "↑" : "↓";
  const logLine = `ST(${atrPeriod},${multiplier}) dir=${dirStr} st=${stStr}`;
  return { signal, logLine };
}

export function runStrategy(input: AnyStrategyInput): { signal: Signal; logLine: string } {
  if (input.strategy === "ema_rsi") {
    return computeEmaRsi(input);
  }
  return computeSuperTrend(input);
}
