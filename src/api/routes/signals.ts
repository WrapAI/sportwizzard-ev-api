import { Router } from "express";
import { db } from "../../store/db.js";

export const signalsRouter = Router();

signalsRouter.get("/edges", (req, res) => {
  const minEdge = parseFloat(req.query.min_edge as string) || 0;
  const league = req.query.league as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

  let sql = "SELECT * FROM edges WHERE edge_percent >= ?";
  const params: unknown[] = [minEdge];
  if (league) { sql += " AND league = ?"; params.push(league); }
  sql += " ORDER BY edge_percent DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows, meta: { count: rows.length } });
});

signalsRouter.get("/arbitrage", (req, res) => {
  const minProfit = parseFloat(req.query.min_profit as string) || 0;
  const league = req.query.league as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

  let sql = "SELECT * FROM arbitrage WHERE profit_percent >= ?";
  const params: unknown[] = [minProfit];
  if (league) { sql += " AND league = ?"; params.push(league); }
  sql += " ORDER BY profit_percent DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows, meta: { count: rows.length } });
});

signalsRouter.get("/events", (req, res) => {
  const league = req.query.league as string;
  const status = req.query.status as string;

  let sql = "SELECT * FROM events WHERE 1=1";
  const params: unknown[] = [];
  if (league) { sql += " AND league = ?"; params.push(league); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY start_time ASC LIMIT 200";

  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows, meta: { count: rows.length } });
});
