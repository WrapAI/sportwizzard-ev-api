import { Router } from "express";
import { db } from "../../store/db.js";
import {
  findPositiveEv,
  findDfsEdges,
  findArbitrage,
  getEvSummary,
  type DevigMethod,
} from "../../ev/engine.js";
import { getDeltaStats } from "../../sync/delta.js";
import { config } from "../../config.js";

export const evRouter = Router();

function parseDevigMethod(value: unknown): DevigMethod {
  if (value === "shin" || value === "power" || value === "multiplicative") return value;
  return "shin";
}

evRouter.get("/opportunities", (req, res) => {
  const minEv = parseFloat(req.query.min_ev as string) || config.minEvPercent;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const league = req.query.league as string;
  const method = parseDevigMethod(req.query.devig);

  let opps = findPositiveEv(minEv, method, limit * (league ? 5 : 1));
  if (league) {
    opps = opps.filter((o) => o.league === league.toLowerCase());
  }

  res.json({
    success: true,
    data: opps.slice(0, limit),
    meta: {
      count: Math.min(opps.length, limit),
      minEvPercent: minEv,
      league: league ?? "all",
      devigMethod: method,
    },
  });
});

evRouter.get("/dfs-edges", (req, res) => {
  const minEdge = parseFloat(req.query.min_edge as string) || config.minEdgePercent;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const league = req.query.league as string;
  const method = parseDevigMethod(req.query.devig);

  let edges = findDfsEdges(minEdge, method, limit * (league ? 5 : 1));
  if (league) {
    edges = edges.filter((e) => e.league === league.toLowerCase());
  }

  res.json({
    success: true,
    data: edges.slice(0, limit),
    meta: {
      count: Math.min(edges.length, limit),
      minEdgePercent: minEdge,
      league: league ?? "all",
      devigMethod: method,
    },
  });
});

evRouter.get("/arbitrage", (req, res) => {
  const minProfit = parseFloat(req.query.min_profit as string) || 0.1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const league = req.query.league as string;

  let arbs = findArbitrage(minProfit, limit * (league ? 5 : 1));
  if (league) {
    arbs = arbs.filter((a) => a.league === league.toLowerCase());
  }

  res.json({
    success: true,
    data: arbs.slice(0, limit),
    meta: {
      count: Math.min(arbs.length, limit),
      minProfitPercent: minProfit,
      league: league ?? "all",
    },
  });
});

evRouter.get("/summary", (_req, res) => {
  const summary = getEvSummary();
  const delta = getDeltaStats();
  const counts = {
    events: (db.prepare("SELECT COUNT(*) as n FROM events").get() as { n: number }).n,
    odds: (db.prepare("SELECT COUNT(*) as n FROM odds").get() as { n: number }).n,
    edges: (db.prepare("SELECT COUNT(*) as n FROM edges").get() as { n: number }).n,
    arbitrage: (db.prepare("SELECT COUNT(*) as n FROM arbitrage").get() as { n: number }).n,
    priceHistory: (db.prepare("SELECT COUNT(*) as n FROM price_history").get() as { n: number }).n,
  };

  res.json({
    success: true,
    data: {
      ev: summary,
      store: counts,
      sync: delta,
    },
  });
});

evRouter.get("/best", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const opps = findPositiveEv(config.minEvPercent, "shin", limit);
  res.json({ success: true, data: opps, meta: { count: opps.length } });
});
