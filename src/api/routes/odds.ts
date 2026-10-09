import { Router } from "express";
import { db } from "../../store/db.js";

export const oddsRouter = Router();

oddsRouter.get("/", (req, res) => {
  const league = req.query.league as string;
  const market = req.query.market as string;
  const sportsbook = req.query.sportsbook as string;
  const eventId = req.query.event_id as string;
  const playerId = req.query.player_id as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

  let sql = `
    SELECT o.*, e.league, e.home_team_name, e.away_team_name, e.start_time as event_start
    FROM odds o
    JOIN events e ON e.id = o.event_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (league) { sql += " AND e.league = ?"; params.push(league); }
  if (market) { sql += " AND o.market LIKE ?"; params.push(`%${market}%`); }
  if (sportsbook) { sql += " AND o.sportsbook = ?"; params.push(sportsbook); }
  if (eventId) { sql += " AND o.event_id = ?"; params.push(eventId); }
  if (playerId) { sql += " AND o.player_id = ?"; params.push(playerId); }

  sql += " ORDER BY o.updated DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows, meta: { count: rows.length } });
});

oddsRouter.get("/history/:oddsId", (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM price_history WHERE id = ? ORDER BY recorded_at DESC LIMIT 100",
  ).all(req.params.oddsId);
  res.json({ success: true, data: rows, meta: { count: rows.length } });
});

oddsRouter.get("/events/:eventId", (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, e.league, e.home_team_name, e.away_team_name
    FROM odds o
    JOIN events e ON e.id = o.event_id
    WHERE o.event_id = ?
    ORDER BY o.market, o.sportsbook, o.selection
    LIMIT 2000
  `).all(req.params.eventId);
  res.json({ success: true, data: rows, meta: { count: rows.length } });
});
