import "dotenv/config";
import { z } from "zod";

const strategyFromEnv = z
  .string()
  .optional()
  .transform((s) => {
    if (s == null || s === "") return "supertrend" as const;
    const t = s.trim().toLowerCase();
    if (t === "ema_rsi" || t === "ema-rsi" || t === "emarsi") return "ema_rsi" as const;
    return "supertrend" as const;
  });

const envSchema = z.object({
  BINANCE_API_KEY: z.string().default(""),
  BINANCE_SECRET: z.string().default(""),
  BINANCE_TESTNET: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  /**
   * `supertrend` — ATR-based SuperTrend (common on TradingView / crypto; default).
   * `ema_rsi` — EMA crossover + RSI filter.
   */
  STRATEGY: strategyFromEnv,
  ST_ATR_PERIOD: z.coerce.number().int().min(1).default(10),
  ST_MULTIPLIER: z.coerce.number().min(0.1).default(3),
  SYMBOL: z.string().default("BTC/USDT"),
  TIMEFRAME: z.string().default("1h"),
  EMA_FAST: z.coerce.number().int().positive().default(12),
  EMA_SLOW: z.coerce.number().int().positive().default(26),
  RSI_PERIOD: z.coerce.number().int().positive().default(14),
  /** Skip buys when RSI is above this (avoids overbought entries) */
  RSI_MAX_BUY: z.coerce.number().min(1).max(99).default(70),
  QUOTE_INVEST_PCT: z.coerce.number().min(0.01).max(1).default(0.1),
  POLL_SEC: z.coerce.number().positive().default(60),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten());
    process.exit(1);
  }
  const c = parsed.data;
  if (c.EMA_FAST >= c.EMA_SLOW) {
    console.error("EMA_FAST must be less than EMA_SLOW");
    process.exit(1);
  }
  return c;
}
