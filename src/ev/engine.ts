import { db } from "../store/db.js";
import { decimalToImpliedProb, removeVig, kellyCriterion, evPercent } from "./math.js";

export interface EvOpportunity {
  eventId: string;
  league: string;
  playerName: string | null;
  teamName: string | null;
  market: string;
  selection: string;
  side: string | null;
  line: number | null;
  sportsbook: string;
  priceDecimal: number;
  priceAmerican: string | null;
  fairProb: number;
  fairDecimal: number;
  evPercent: number;
  kellyFull: number;
  kellyQuarter: number;
  updatedAt: string;
}

interface ConsensusRow {
  event_id: string;
  market: string;
  selection: string;
  side: string | null;
  player_id: string | null;
  player_name: string | null;
  team_name: string | null;
  line: number | null;
  league: string;
}

export function computeConsensusFairs(): Map<string, { prob: number; decimal: number }> {
  const groups = db.prepare(`
    SELECT
      o.event_id, o.market, o.selection, o.side, o.player_id, o.player_name,
      o.team_name, o.line, e.league,
      AVG(o.price_decimal) as avg_price,
      COUNT(DISTINCT o.sportsbook) as book_count
    FROM odds o
    JOIN events e ON e.id = o.event_id
    WHERE o.suspended = 0 AND o.price_decimal > 1 AND o.price_decimal IS NOT NULL
    GROUP BY o.event_id, o.market, o.selection, o.side, o.player_id, o.line
    HAVING book_count >= 2
  `).all() as (ConsensusRow & { avg_price: number; book_count: number })[];

  const fairs = new Map<string, { prob: number; decimal: number }>();

  for (const group of groups) {
    const key = `${group.event_id}|${group.market}|${group.selection}|${group.side}|${group.player_id}|${group.line}`;
    const avgProb = decimalToImpliedProb(group.avg_price);
    fairs.set(key, { prob: avgProb, decimal: 1 / avgProb });
  }

  const complementary = db.prepare(`
    SELECT
      o.event_id, o.market, o.side, o.player_id, o.line,
      AVG(o.price_decimal) as avg_price
    FROM odds o
    WHERE o.suspended = 0 AND o.price_decimal > 1 AND o.side IN ('OVER', 'UNDER', 'HOME', 'AWAY')
    GROUP BY o.event_id, o.market, o.side, o.player_id, o.line
    HAVING COUNT(DISTINCT o.sportsbook) >= 2
  `).all() as {
    event_id: string;
    market: string;
    side: string;
    player_id: string | null;
    line: number | null;
    avg_price: number;
  }[];

  const pairs = new Map<string, { overProb: number; underProb: number }>();

  for (const row of complementary) {
    const base = `${row.event_id}|${row.market}|${row.player_id}|${row.line}`;
    if (row.side === "OVER") {
      const pair = pairs.get(base) ?? { overProb: 0, underProb: 0 };
      pair.overProb = decimalToImpliedProb(row.avg_price);
      pairs.set(base, pair);
    } else if (row.side === "UNDER") {
      const pair = pairs.get(base) ?? { overProb: 0, underProb: 0 };
      pair.underProb = decimalToImpliedProb(row.avg_price);
      pairs.set(base, pair);
    }
  }

  for (const [base, pair] of pairs) {
    if (pair.overProb > 0 && pair.underProb > 0) {
      const noVig = removeVig(pair.overProb, pair.underProb);
      for (const [sideKey, prob] of [
        ["OVER", noVig.over],
        ["UNDER", noVig.under],
      ] as const) {
        if (prob > 0) {
          const key = `${base}|${sideKey}`;
          fairs.set(key, { prob, decimal: 1 / prob });
        }
      }
    }
  }

  return fairs;
}

export function findEvOpportunities(minEvPercent: number, limit = 100): EvOpportunity[] {
  const fairs = computeConsensusFairs();
  if (fairs.size === 0) return [];

  const odds = db.prepare(`
    SELECT
      o.event_id, o.sportsbook, o.market, o.selection, o.side, o.team_name,
      o.player_id, o.player_name, o.line, o.price_decimal, o.price_american, o.updated, e.league
    FROM odds o
    JOIN events e ON e.id = o.event_id
    WHERE o.suspended = 0 AND o.price_decimal > 1
    ORDER BY o.updated DESC
    LIMIT 10000
  `).all() as (ConsensusRow & {
    sportsbook: string;
    price_decimal: number;
    price_american: string | null;
    updated: string;
  })[];

  const opportunities: EvOpportunity[] = [];

  for (const row of odds) {
    const fairKey = `${row.event_id}|${row.market}|${row.selection}|${row.side}|${row.player_id}|${row.line}`;
    const altKey = `${row.event_id}|${row.market}|${row.player_id}|${row.line}|${row.side}`;

    const fair = fairs.get(fairKey) ?? fairs.get(altKey);
    if (!fair || fair.prob <= 0 || fair.prob >= 1) continue;

    const ev = evPercent(fair.prob, row.price_decimal);
    if (ev < minEvPercent) continue;

    const kellyFull = kellyCriterion(fair.prob, row.price_decimal, 1.0);
    const kellyQuarter = kellyCriterion(fair.prob, row.price_decimal, 0.25);

    opportunities.push({
      eventId: row.event_id,
      league: row.league,
      playerName: row.player_name,
      teamName: row.team_name,
      market: row.market,
      selection: row.selection,
      side: row.side,
      line: row.line,
      sportsbook: row.sportsbook,
      priceDecimal: row.price_decimal,
      priceAmerican: row.price_american,
      fairProb: fair.prob,
      fairDecimal: fair.decimal,
      evPercent: Math.round(ev * 100) / 100,
      kellyFull: Math.round(kellyFull * 10000) / 100,
      kellyQuarter: Math.round(kellyQuarter * 10000) / 100,
      updatedAt: row.updated,
    });
  }

  opportunities.sort((a, b) => b.evPercent - a.evPercent);
  return opportunities.slice(0, limit);
}

export function getEvSummary(): {
  totalOpportunities: number;
  avgEvPercent: number;
  bestEv: EvOpportunity | null;
  byLeague: Record<string, number>;
} {
  const opps = findEvOpportunities(0.1, 10000);
  const byLeague: Record<string, number> = {};
  for (const opp of opps) {
    byLeague[opp.league] = (byLeague[opp.league] ?? 0) + 1;
  }
  return {
    totalOpportunities: opps.length,
    avgEvPercent: opps.length > 0 ? opps.reduce((s, o) => s + o.evPercent, 0) / opps.length : 0,
    bestEv: opps[0] ?? null,
    byLeague,
  };
}
