import { Router } from "express";
import { db } from "../../store/db.js";
import { findEvOpportunities, getEvSummary } from "../../ev/engine.js";
import { getDeltaStats } from "../../sync/delta.js";
import { config } from "../../config.js";

export const evRouter = Router();

evRouter.get("/opportunities", (req, res) => {
  const minEv = parseFloat(req.query.min_ev as string) || config.minEvPercent;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const league = req.query.league as string;

  let opps = findEvOpportunities(minEv, limit);
  if (league) {
    opps = opps.filter((o) => o.league === league.toLowerCase());
  }

  res.json({
    success: true,
    data: opps,
    meta: {
      count: opps.length,
      minEvPercent: minEv,
      league: league ?? "all",
    },
  });
});

evRouter.get("/summary", (_req, res) => {
  const summary = getEvSummary();
  const delta = getDeltaStats();
  const eventCount = (db.prepare("SELECT COUNT(*) as n FROM events").get() as { n: number }).n;
  const oddsCount = (db.prepare("SELECT COUNT(*) as n FROM odds").get() as { n: number }).n;
  const edgeCount = (db.prepare("SELECT COUNT(*) as n FROM edges").get() as { n: number }).n;
  const arbCount = (db.prepare("SELECT COUNT(*) as n FROM arbitrage").get() as { n: number }).n;

  res.json({
    success: true,
    data: {
      ev: summary,
      store: {
        events: eventCount,
        odds: oddsCount,
        edges: edgeCount,
        arbitrage: arbCount,
      },
      sync: delta,
    },
  });
});

evRouter.get("/best", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const opps = findEvOpportunities(config.minEvPercent, limit);
  res.json({ success: true, data: opps, meta: { count: opps.length } });
});
