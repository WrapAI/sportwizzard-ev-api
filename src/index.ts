import express from "express";
import { config } from "./config.js";
import { initSchema } from "./store/db.js";
import { bootstrapReference, bootstrapEvents, bootstrapOdds, bootstrapEdges, bootstrapArbitrage } from "./sync/bootstrap.js";
import { startDelta, getDeltaStats } from "./sync/delta.js";
import { evRouter } from "./api/routes/ev.js";
import { oddsRouter } from "./api/routes/odds.js";
import { signalsRouter } from "./api/routes/signals.js";
import { scrapersRouter } from "./api/routes/scrapers.js";
import { registerScraper, listScrapers } from "./scrapers/registry.js";
import { createAllKambiScrapers } from "./scrapers/kambi/scraper.js";
import { DraftKingsScraper } from "./scrapers/adapters/draftkings.js";
import { DkPick6Scraper } from "./scrapers/adapters/dkpick6.js";
import { FanDuelScraper } from "./scrapers/adapters/fanduel.js";
import { BetMgmScraper } from "./scrapers/adapters/betmgm.js";
import { PrizePicksScraper } from "./scrapers/adapters/prizepicks.js";
import { PolymarketScraper } from "./scrapers/adapters/polymarket.js";
import { KalshiScraper } from "./scrapers/adapters/kalshi.js";
import { BovadaScraper } from "./scrapers/adapters/bovada.js";
import { SleeperScraper } from "./scrapers/adapters/sleeper.js";
import { SHARP_BOOKS, DFS_BOOKS } from "./ev/books.js";

const app = express();
app.use(express.json());

initSchema();

app.get("/health", (_req, res) => {
  const delta = getDeltaStats();
  res.json({
    status: "ok",
    uptime: process.uptime(),
    sync: delta,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1", evRouter);
app.use("/api/v1/odds", oddsRouter);
app.use("/api/v1/signals", signalsRouter);
app.use("/api/v1/scrapers", scrapersRouter);

async function main(): Promise<void> {
  console.log(`[ev-api] starting on ${config.host}:${config.port}`);
  console.log(`[ev-api] db: ${config.dbPath}`);
  console.log(`[ev-api] sync interval: ${config.syncIntervalMs}ms`);
  console.log(`[ev-api] sharp books: ${SHARP_BOOKS.join(", ")}`);
  console.log(`[ev-api] dfs books: ${DFS_BOOKS.join(", ")}`);

  if (config.snapshotOnStart && config.apiKey) {
    console.log("[ev-api] bootstrapping...");
    try {
      await bootstrapReference();
      await bootstrapEvents();
      await bootstrapOdds();
      await bootstrapEdges();
      await bootstrapArbitrage();
      console.log("[ev-api] bootstrap complete");
    } catch (error) {
      console.error(
        "[ev-api] bootstrap failed (continuing with delta only):",
        error instanceof Error ? error.message : error,
      );
    }
  } else if (config.snapshotOnStart && !config.apiKey) {
    console.log("[ev-api] SPORTWIZZARD_API_KEY not set — skipping SportWizzard bootstrap, scrapers only");
  }

  console.log("[ev-api] registering scrapers...");
  registerScraper(new DraftKingsScraper());
  registerScraper(new DkPick6Scraper());
  registerScraper(new FanDuelScraper());
  registerScraper(new BetMgmScraper());
  registerScraper(new PrizePicksScraper());
  registerScraper(new PolymarketScraper());
  registerScraper(new KalshiScraper());
  registerScraper(new BovadaScraper());
  registerScraper(new SleeperScraper());
  for (const kambi of createAllKambiScrapers()) {
    registerScraper(kambi);
  }
  console.log(`[ev-api] ${listScrapers().length} scrapers registered`);

  if (config.apiKey) {
    startDelta(config.syncIntervalMs);
  } else {
    console.log("[ev-api] SPORTWIZZARD_API_KEY not set — delta poller disabled");
  }

  app.listen(config.port, config.host, () => {
    console.log(`[ev-api] listening on http://${config.host}:${config.port}`);
    console.log(`[ev-api] endpoints:`);
    console.log(`  GET /health`);
    console.log(`  GET /api/v1/opportunities?min_ev=2.0&league=nfl&devig=shin`);
    console.log(`  GET /api/v1/dfs-edges?min_edge=1.0&devig=shin`);
    console.log(`  GET /api/v1/arbitrage?min_profit=0.5`);
    console.log(`  GET /api/v1/summary`);
    console.log(`  GET /api/v1/best?limit=10`);
    console.log(`  GET /api/v1/odds?league=nfl&market=PLAYER_TOTAL`);
    console.log(`  GET /api/v1/odds/events/:eventId`);
    console.log(`  GET /api/v1/odds/history/:oddsId`);
    console.log(`  GET /api/v1/signals/edges?min_edge=3.0`);
    console.log(`  GET /api/v1/signals/arbitrage?min_profit=1.0`);
    console.log(`  GET /api/v1/signals/events?league=nfl`);
    console.log(`  GET /api/v1/signals/sportsbooks`);
  });
}

main().catch((error) => {
  console.error("[ev-api] fatal:", error);
  process.exit(1);
});
