import ccxt, { type OHLCV } from "ccxt";
import type { AppConfig } from "./config.js";
import { runStrategy } from "./strategy.js";

type Binance = InstanceType<typeof ccxt["binance"]>;

function ohlcvToCloses(ohlcv: OHLCV[], excludeInProgress: boolean): number[] {
  const rows = excludeInProgress && ohlcv.length > 0 ? ohlcv.slice(0, -1) : ohlcv;
  return rows.map((c) => c[4] as number);
}

function ohlcvToHLC(
  ohlcv: OHLCV[],
  excludeInProgress: boolean
): { high: number[]; low: number[]; close: number[] } {
  const rows = excludeInProgress && ohlcv.length > 0 ? ohlcv.slice(0, -1) : ohlcv;
  return {
    high: rows.map((c) => c[2] as number),
    low: rows.map((c) => c[3] as number),
    close: rows.map((c) => c[4] as number),
  };
}

function lastClosedBarOpen(ohlcv: OHLCV[]): number | undefined {
  if (ohlcv.length < 2) return undefined;
  return ohlcv[ohlcv.length - 2]![0] as number;
}

export class TradingBot {
  private exchange: Binance;
  private config: AppConfig;
  /** Avoid placing the same order twice on the last closed bar */
  private lastActedOnBarOpen: number | null = null;

  constructor(config: AppConfig) {
    this.config = config;
    this.exchange = new ccxt.binance({
      apiKey: config.BINANCE_API_KEY || undefined,
      secret: config.BINANCE_SECRET || undefined,
      options: { defaultType: "spot" },
      enableRateLimit: true,
    });
    this.exchange.setSandboxMode(config.BINANCE_TESTNET);
  }

  async start(): Promise<void> {
    const c = this.config;
    await this.exchange.loadMarkets();
    console.log(
      `[bot] ${c.SYMBOL} ${c.TIMEFRAME} | strategy=${c.STRATEGY} testnet=${c.BINANCE_TESTNET} dryRun=${c.DRY_RUN} invest=${(c.QUOTE_INVEST_PCT * 100).toFixed(0)}% USDT`
    );
    for (;;) {
      try {
        await this.tick();
      } catch (e) {
        console.error("[bot] tick error:", e);
      }
      await new Promise((r) => setTimeout(r, c.POLL_SEC * 1000));
    }
  }

  private async tick(): Promise<void> {
    const c = this.config;
    const minBars =
      c.STRATEGY === "supertrend"
        ? c.ST_ATR_PERIOD + 2
        : c.EMA_SLOW + c.RSI_PERIOD + 5;
    const limit = Math.max(120, minBars);
    const ohlcv = (await this.exchange.fetchOHLCV(
      c.SYMBOL,
      c.TIMEFRAME,
      undefined,
      limit
    )) as OHLCV[];
    if (ohlcv.length < 2) {
      console.warn("[bot] not enough OHLCV");
      return;
    }
    const barOpen = lastClosedBarOpen(ohlcv);
    if (barOpen == null) return;

    const { high, low, close } = ohlcvToHLC(ohlcv, true);
    const minLen =
      c.STRATEGY === "supertrend"
        ? c.ST_ATR_PERIOD + 1
        : c.EMA_SLOW + 2;
    if (close.length < minLen) return;

    const { signal, logLine } =
      c.STRATEGY === "supertrend"
        ? runStrategy({
            strategy: "supertrend",
            high,
            low,
            close,
            atrPeriod: c.ST_ATR_PERIOD,
            multiplier: c.ST_MULTIPLIER,
          })
        : runStrategy({
            strategy: "ema_rsi",
            closes: ohlcvToCloses(ohlcv, true),
            emaFastPeriod: c.EMA_FAST,
            emaSlowPeriod: c.EMA_SLOW,
            rsiPeriod: c.RSI_PERIOD,
            rsiMaxForBuy: c.RSI_MAX_BUY,
          });
    const lastClose = close[close.length - 1]!;
    const acted =
      this.lastActedOnBarOpen === barOpen ? " (action already done this bar)" : "";
    console.log(
      `[${new Date(barOpen).toISOString()}] close=${lastClose.toFixed(2)} | ${logLine} → ${signal.toUpperCase()}${acted}`
    );

    if (signal === "hold") return;
    if (this.lastActedOnBarOpen === barOpen) return;

    if (c.DRY_RUN) {
      console.log(
        "[bot] DRY_RUN: would",
        signal === "buy" ? "BUY" : "SELL",
        c.SYMBOL
      );
      this.lastActedOnBarOpen = barOpen;
      return;
    }

    if (signal === "buy") {
      const balance = await this.exchange.fetchBalance();
      const quote = c.SYMBOL.split("/")[1] || "USDT";
      const free = (balance[quote]?.free as number) ?? 0;
      if (free <= 0) {
        console.warn(`[bot] no free ${quote} to buy`);
        return;
      }
      const spend = free * c.QUOTE_INVEST_PCT;
      await this.marketBuyQuote(c.SYMBOL, spend);
      this.lastActedOnBarOpen = barOpen;
      return;
    }

    if (signal === "sell") {
      const base = c.SYMBOL.split("/")[0] || "";
      const balance = await this.exchange.fetchBalance();
      const freeBase = (balance[base]?.free as number) ?? 0;
      if (freeBase <= 0) {
        console.warn(`[bot] no ${base} to sell; marking bar processed`);
        this.lastActedOnBarOpen = barOpen;
        return;
      }
      const amt = this.exchange.amountToPrecision(c.SYMBOL, freeBase);
      await this.exchange.createOrder(
        c.SYMBOL,
        "market",
        "sell",
        this.exchange.parseNumber(amt) ?? freeBase
      );
      this.lastActedOnBarOpen = barOpen;
    }
  }

  private async marketBuyQuote(symbol: string, spendQuote: number): Promise<void> {
    if (this.exchange.createMarketOrderWithCost) {
      await this.exchange.createMarketOrderWithCost(
        symbol,
        "buy",
        spendQuote
      );
      return;
    }
    const cost = this.exchange.costToPrecision(symbol, spendQuote);
    const costN = this.exchange.parseNumber(cost) ?? spendQuote;
    try {
      await this.exchange.createOrder(
        symbol,
        "market",
        "buy",
        0,
        undefined,
        { quoteOrderQty: costN }
      );
    } catch {
      const ticker = await this.exchange.fetchTicker(symbol);
      const price = ticker.last;
      if (price == null) throw new Error("no last price for sizing");
      const baseAmt = this.exchange.amountToPrecision(
        symbol,
        costN / price
      );
      const baseN = this.exchange.parseNumber(baseAmt) ?? costN / price;
      await this.exchange.createOrder(symbol, "market", "buy", baseN);
    }
  }
}
