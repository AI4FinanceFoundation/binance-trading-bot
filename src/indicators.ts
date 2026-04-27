/**
 * True range (Wilder / TradingView).
 */
export function trueRange(
  high: number[],
  low: number[],
  close: number[]
): number[] {
  const n = high.length;
  if (n !== low.length || n !== close.length) {
    throw new Error("trueRange: array length mismatch");
  }
  const tr: number[] = [];
  tr[0] = high[0]! - low[0]!;
  for (let i = 1; i < n; i++) {
    const range = high[i]! - low[i]!;
    const hc = Math.abs(high[i]! - close[i - 1]!);
    const lc = Math.abs(low[i]! - close[i - 1]!);
    tr[i] = Math.max(range, hc, lc);
  }
  return tr;
}

/**
 * Wilder ATR (RMA of TR). First ATR is simple average of first `period` TR values; index 0..period-2 is null.
 */
export function wilderAtr(
  tr: number[],
  period: number
): (number | null)[] {
  const n = tr.length;
  const out: (number | null)[] = Array(n).fill(null);
  if (n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i]!;
  }
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    const prev = out[i - 1]!;
    out[i] = (prev * (period - 1) + tr[i]!) / period;
  }
  return out;
}

/**
 * SuperTrend (common TradingView / retail implementation).
 * Uptrend: dir = 1. Downtrend: dir = -1.
 * @returns direction per bar; null until `period-1` where bands first exist, then from `start` (period-1) onward values are set; earlier indices stay null
 */
export function supertrend(
  high: number[],
  low: number[],
  close: number[],
  period: number,
  multiplier: number
): { direction: (1 | -1 | null)[]; line: (number | null)[]; finalUpper: number[]; finalLower: number[] } {
  const n = high.length;
  const tr = trueRange(high, low, close);
  const atr = wilderAtr(tr, period);
  const finalUpper: number[] = new Array(n).fill(0);
  const finalLower: number[] = new Array(n).fill(0);
  const direction: (1 | -1 | null)[] = Array(n).fill(null);
  const line: (number | null)[] = Array(n).fill(null);

  const uBasic: number[] = new Array(n).fill(0);
  const lBasic: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (atr[i] == null) continue;
    const src = (high[i]! + low[i]!) / 2;
    uBasic[i] = src + multiplier * (atr[i] as number);
    lBasic[i] = src - multiplier * (atr[i] as number);
  }

  const i0 = period - 1;
  if (i0 < 0 || i0 >= n || atr[i0] == null) {
    return { direction, line, finalUpper, finalLower };
  }
  finalUpper[i0] = uBasic[i0]!;
  finalLower[i0] = lBasic[i0]!;

  for (let i = i0 + 1; i < n; i++) {
    if (atr[i] == null) continue;
    if (
      uBasic[i]! < finalUpper[i - 1]! ||
      close[i - 1]! > finalUpper[i - 1]!
    ) {
      finalUpper[i] = uBasic[i]!;
    } else {
      finalUpper[i] = finalUpper[i - 1]!;
    }
    if (
      lBasic[i]! > finalLower[i - 1]! ||
      close[i - 1]! < finalLower[i - 1]!
    ) {
      finalLower[i] = lBasic[i]!;
    } else {
      finalLower[i] = finalLower[i - 1]!;
    }
  }

  direction[i0] =
    close[i0]! > (finalUpper[i0]! + finalLower[i0]!) / 2 ? 1 : -1;
  line[i0] = direction[i0] === 1 ? finalLower[i0]! : finalUpper[i0]!;

  for (let i = i0 + 1; i < n; i++) {
    const prevD = direction[i - 1];
    if (prevD == null) continue;
    if (prevD === 1) {
      if (close[i]! < finalLower[i]!) {
        direction[i] = -1;
        line[i] = finalUpper[i]!;
      } else {
        direction[i] = 1;
        line[i] = finalLower[i]!;
      }
    } else {
      if (close[i]! > finalUpper[i]!) {
        direction[i] = 1;
        line[i] = finalLower[i]!;
      } else {
        direction[i] = -1;
        line[i] = finalUpper[i]!;
      }
    }
  }

  return { direction, line, finalUpper, finalLower };
}

/** Wilder / standard EMA */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    const p = values[i];
    prev = i === 0 ? p : p * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(closes: number[], period: number): (number | null)[] {
  if (closes.length < period + 1) {
    return closes.map(() => null);
  }
  const out: (number | null)[] = Array(closes.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gains += ch;
    else losses -= ch;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const firstIdx = period;
  if (avgLoss === 0) out[firstIdx] = 100;
  else {
    const rs = avgGain / avgLoss;
    out[firstIdx] = 100 - 100 / (1 + rs);
  }
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    if (avgLoss === 0) out[i] = 100;
    else {
      const rs = avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}
