import express from "express";
import { config } from "./config.js";
import { initSchema } from "./store/db.js";
import { bootstrapReference, bootstrapEvents, bootstrapEdges, bootstrapArbitrage } from "./sync/bootstrap.js";
import { startDelta, getDeltaStats } from "./sync/delta.js";
import { evRouter } from "./api/routes/ev.js";
import { oddsRouter } from "./api/routes/odds.js";
import { signalsRouter } from "./api/routes/signals.js";

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

async function main(): Promise<void> {
  console.log(`[ev-api] starting on ${config.host}:${config.port}`);
  console.log(`[ev-api] db: ${config.dbPath}`);
  console.log(`[ev-api] sync interval: ${config.syncIntervalMs}ms`);

  if (config.snapshotOnStart) {
    console.log("[ev-api] bootstrapping...");
    try {
      await bootstrapReference();
      await bootstrapEvents();
      await bootstrapEdges();
      await bootstrapArbitrage();
      console.log("[ev-api] bootstrap complete");
    } catch (error) {
      console.error("[ev-api] bootstrap failed (continuing with delta only):", error instanceof Error ? error.message : error);
    }
  }

  startDelta(config.syncIntervalMs);

  app.listen(config.port, config.host, () => {
    console.log(`[ev-api] listening on http://${config.host}:${config.port}`);
    console.log(`[ev-api] endpoints:`);
    console.log(`  GET /health`);
    console.log(`  GET /api/v1/opportunities?min_ev=2.0&league=nfl&limit=50`);
    console.log(`  GET /api/v1/summary`);
    console.log(`  GET /api/v1/best?limit=10`);
    console.log(`  GET /api/v1/odds?league=nfl&market=PLAYER_TOTAL`);
    console.log(`  GET /api/v1/odds/history/:oddsId`);
    console.log(`  GET /api/v1/signals/edges?min_edge=3.0`);
    console.log(`  GET /api/v1/signals/arbitrage?min_profit=1.0`);
    console.log(`  GET /api/v1/signals/events?league=nfl`);
  });
}

main().catch((error) => {
  console.error("[ev-api] fatal:", error);
  process.exit(1);
});
