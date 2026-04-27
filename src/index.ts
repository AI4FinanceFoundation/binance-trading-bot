import { loadConfig } from "./config.js";
import { TradingBot } from "./bot.js";

const config = loadConfig();
const bot = new TradingBot(config);
void bot.start();
