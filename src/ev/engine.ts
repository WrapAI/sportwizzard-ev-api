import { db } from "../store/db.js";
import {
  decimalToAmerican,
  devig,
  kellyCriterion,
  expectedValuePercent,
  dfsExpectedValuePercent,
  type DevigMethod,
} from "./math.js";
import { SHARP_BOOKS, DFS_BOOKS, BOOK_ALIASES } from "./books.js";

export { SHARP_BOOKS, DFS_BOOKS, BOOK_ALIASES };
export type { DevigMethod };

export interface EvOpportunity {
  eventId: string;
  league: string;
  event: string;
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
  fairAmerican: string;
  evPercent: number;
  kellyFull: number;
  kellyQuarter: number;
  sourceBook: string;
  updatedAt: string;
}

export interface DfsEdge {
  eventId: string;
  league: string;
  event: string;
  playerName: string | null;
  market: string;
  side: string | null;
  line: number | null;
  dfsBook: string;
  fairProb: number;
  fairAmerican: string;
  payoutMultiplier: number;
  edgePercent: number;
  sourceBook: string;
  updatedAt: string;
}

export interface ArbitrageOpportunity {
  eventId: string;
  league: string;
  event: string;
  market: string;
  playerName: string | null;
  line: number | null;
  overBook: string;
  overOdds: number;
  underBook: string;
  underOdds: number;
  profitPercent: number;
  stakeOverPercent: number;
  stakeUnderPercent: number;
}

interface OddsDbRow {
  id: string;
  event_id: string;
  sportsbook: string;
  market: string;
  selection: string;
  side: string | null;
  team_side: string | null;
  team_name: string | null;
  line: number | null;
  price_american: string | null;
  price_decimal: number | null;
  dfs_multiplier: number | null;
  player_id: string | null;
  player_name: string | null;
  suspended: number;
  is_main: number;
  updated: string;
  league: string;
  home_team_name: string;
  away_team_name: string;
}

interface FairEntry {
  prob: number;
  decimal: number;
  american: string;
  sourceBook: string;
}

function normalizeBook(name: string): string {
  return BOOK_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
}

function lineKey(eventId: string, market: string, playerId: string | null, line: number | null): string {
  return `${eventId}|${market}|${playerId ?? ""}|${line ?? ""}`;
}

function fetchOdds(limit = 50000): OddsDbRow[] {
  return db.prepare(`
    SELECT o.*, e.league, e.home_team_name, e.away_team_name
    FROM odds o
    JOIN events e ON e.id = o.event_id
    WHERE o.suspended = 0 AND o.price_decimal IS NOT NULL AND o.price_decimal > 1
    ORDER BY o.updated DESC
    LIMIT ?
  `).all(limit) as unknown as OddsDbRow[];
}

export function computeFairOdds(method: DevigMethod = "shin"): Map<string, FairEntry> {
  const odds = fetchOdds();
  const grouped = new Map<string, OddsDbRow[]>();

  for (const row of odds) {
    const key = lineKey(row.event_id, row.market, row.player_id, row.line);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const fairs = new Map<string, FairEntry>();

  for (const [key, rows] of grouped) {
    const overs = new Map<string, number>();
    const unders = new Map<string, number>();

    for (const row of rows) {
      const book = normalizeBook(row.sportsbook);
      const dec = row.price_decimal ?? 0;
      const side = row.side ?? "";
      if (dec > 1.0) {
        if (side === "OVER") overs.set(book, dec);
        else if (side === "UNDER") unders.set(book, dec);
      }
    }

    let sourceBook: string | null = null;
    let overDec = 0;
    let underDec = 0;

    for (const sharp of SHARP_BOOKS) {
      if (overs.has(sharp) && unders.has(sharp)) {
        sourceBook = sharp;
        overDec = overs.get(sharp)!;
        underDec = unders.get(sharp)!;
        break;
      }
    }

    if (!sourceBook) {
      if (overs.size >= 3 && unders.size >= 3) {
        const sortedOvers = [...overs.values()].sort((a, b) => a - b);
        const sortedUnders = [...unders.values()].sort((a, b) => a - b);
        overDec = sortedOvers[Math.floor(sortedOvers.length / 2)];
        underDec = sortedUnders[Math.floor(sortedUnders.length / 2)];
        sourceBook = "consensus_median";
      } else {
        continue;
      }
    }

    const result = devig(overDec, underDec, method);

    if (result.over > 0 && result.over < 1) {
      fairs.set(`${key}|OVER`, {
        prob: result.over,
        decimal: 1 / result.over,
        american: decimalToAmerican(1 / result.over),
        sourceBook,
      });
    }
    if (result.under > 0 && result.under < 1) {
      fairs.set(`${key}|UNDER`, {
        prob: result.under,
        decimal: 1 / result.under,
        american: decimalToAmerican(1 / result.under),
        sourceBook,
      });
    }
  }

  return fairs;
}

export function findPositiveEv(
  minEvPercent: number,
  method: DevigMethod = "shin",
  limit = 100,
): EvOpportunity[] {
  const fairs = computeFairOdds(method);
  if (fairs.size === 0) return [];

  const odds = fetchOdds();
  const sharpSet = new Set(SHARP_BOOKS);
  const opportunities: EvOpportunity[] = [];

  for (const row of odds) {
    const book = normalizeBook(row.sportsbook);
    const side = row.side ?? "";
    const key = `${lineKey(row.event_id, row.market, row.player_id, row.line)}|${side}`;
    const fair = fairs.get(key);

    if (!fair) continue;
    if (sharpSet.has(book)) continue;

    const betDec = row.price_decimal ?? 0;
    if (betDec <= 1.0 || fair.prob <= 0 || fair.prob >= 1) continue;

    const ev = expectedValuePercent(fair.prob, betDec);
    if (ev < minEvPercent) continue;

    opportunities.push({
      eventId: row.event_id,
      league: row.league,
      event: `${row.away_team_name} @ ${row.home_team_name}`,
      playerName: row.player_name,
      teamName: row.team_name,
      market: row.market,
      selection: row.selection,
      side: row.side,
      line: row.line,
      sportsbook: row.sportsbook,
      priceDecimal: betDec,
      priceAmerican: row.price_american,
      fairProb: Math.round(fair.prob * 100000) / 100000,
      fairDecimal: Math.round(fair.decimal * 1000) / 1000,
      fairAmerican: fair.american,
      evPercent: Math.round(ev * 100) / 100,
      kellyFull: Math.round(kellyCriterion(fair.prob, betDec, 1.0) * 10000) / 100,
      kellyQuarter: Math.round(kellyCriterion(fair.prob, betDec, 0.25) * 10000) / 100,
      sourceBook: fair.sourceBook,
      updatedAt: row.updated,
    });
  }

  opportunities.sort((a, b) => b.evPercent - a.evPercent);
  return opportunities.slice(0, limit);
}

export function findDfsEdges(
  minEdgePercent: number = 1.0,
  method: DevigMethod = "shin",
  limit = 100,
): DfsEdge[] {
  const fairs = computeFairOdds(method);
  if (fairs.size === 0) return [];

  const odds = fetchOdds();
  const dfsSet = new Set(DFS_BOOKS);
  const edges: DfsEdge[] = [];

  for (const row of odds) {
    const book = normalizeBook(row.sportsbook);
    if (!dfsSet.has(book)) continue;

    const side = row.side ?? "";
    const key = `${lineKey(row.event_id, row.market, row.player_id, row.line)}|${side}`;
    const fair = fairs.get(key);
    if (!fair) continue;

    const payout = row.dfs_multiplier ?? 2.0;
    const edge = dfsExpectedValuePercent(fair.prob, payout);
    if (edge < minEdgePercent) continue;

    edges.push({
      eventId: row.event_id,
      league: row.league,
      event: `${row.away_team_name} @ ${row.home_team_name}`,
      playerName: row.player_name,
      market: row.market,
      side: row.side,
      line: row.line,
      dfsBook: row.sportsbook,
      fairProb: Math.round(fair.prob * 100000) / 100000,
      fairAmerican: fair.american,
      payoutMultiplier: payout,
      edgePercent: Math.round(edge * 100) / 100,
      sourceBook: fair.sourceBook,
      updatedAt: row.updated,
    });
  }

  edges.sort((a, b) => b.edgePercent - a.edgePercent);
  return edges.slice(0, limit);
}

export function findArbitrage(
  minProfitPercent: number = 0.1,
  limit = 100,
): ArbitrageOpportunity[] {
  const odds = fetchOdds();
  const lines = new Map<string, Map<string, Map<string, { dec: number; row: OddsDbRow }>>>();

  for (const row of odds) {
    const key = lineKey(row.event_id, row.market, row.player_id, row.line);
    const side = row.side ?? "";
    const book = normalizeBook(row.sportsbook);
    const dec = row.price_decimal ?? 0;

    if ((side === "OVER" || side === "UNDER") && dec > 1.0) {
      if (!lines.has(key)) lines.set(key, new Map());
      const sides = lines.get(key)!;
      if (!sides.has(side)) sides.set(side, new Map());
      sides.get(side)!.set(book, { dec, row });
    }
  }

  const arbs: ArbitrageOpportunity[] = [];

  for (const [, sides] of lines) {
    const overMap = sides.get("OVER");
    const underMap = sides.get("UNDER");
    if (!overMap || !underMap || overMap.size === 0 || underMap.size === 0) continue;

    let bestOver: [string, { dec: number; row: OddsDbRow }] | null = null;
    for (const entry of overMap.entries()) {
      if (!bestOver || entry[1].dec > bestOver[1].dec) bestOver = entry;
    }

    let bestUnder: [string, { dec: number; row: OddsDbRow }] | null = null;
    for (const entry of underMap.entries()) {
      if (!bestUnder || entry[1].dec > bestUnder[1].dec) bestUnder = entry;
    }

    if (!bestOver || !bestUnder) continue;
    if (bestOver[0] === bestUnder[0]) continue;

    const pOver = 1 / bestOver[1].dec;
    const pUnder = 1 / bestUnder[1].dec;
    const total = pOver + pUnder;

    if (total < 1.0) {
      const profit = (1.0 - total) * 100;
      if (profit >= minProfitPercent) {
        const row = bestOver[1].row;
        arbs.push({
          eventId: row.event_id,
          league: row.league,
          event: `${row.away_team_name} @ ${row.home_team_name}`,
          market: row.market,
          playerName: row.player_name,
          line: row.line,
          overBook: bestOver[0],
          overOdds: bestOver[1].dec,
          underBook: bestUnder[0],
          underOdds: bestUnder[1].dec,
          profitPercent: Math.round(profit * 100) / 100,
          stakeOverPercent: Math.round((pOver / total) * 1000) / 10,
          stakeUnderPercent: Math.round((pUnder / total) * 1000) / 10,
        });
      }
    }
  }

  arbs.sort((a, b) => b.profitPercent - a.profitPercent);
  return arbs.slice(0, limit);
}

export function getEvSummary() {
  const opps = findPositiveEv(0.1, "shin", 10000);
  const dfs = findDfsEdges(0.1, "shin", 10000);
  const arbs = findArbitrage(0.01, 10000);

  const byLeague: Record<string, number> = {};
  for (const opp of opps) {
    byLeague[opp.league] = (byLeague[opp.league] ?? 0) + 1;
  }

  return {
    totalOpportunities: opps.length,
    avgEvPercent: opps.length > 0
      ? Math.round((opps.reduce((s, o) => s + o.evPercent, 0) / opps.length) * 100) / 100
      : 0,
    bestEv: opps[0] ?? null,
    byLeague,
    dfsEdgeCount: dfs.length,
    arbitrageCount: arbs.length,
  };
}
