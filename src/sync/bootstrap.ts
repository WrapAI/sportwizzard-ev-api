import { sw } from "../client/sportwizzard.js";
import type { SwOddsRow, SwEvent, SwPlayer, SwTeam, SwEdge, SwArbitrage } from "../client/types.js";
import { db, getSyncState, setSyncState } from "../store/db.js";

const upsertEvent = db.prepare(`
  INSERT INTO events (id, league, home_team_id, home_team_name, away_team_id, away_team_name, start_time, status, season_year, has_odds, synced_at)
  VALUES (@id, @league, @homeTeamId, @homeTeamName, @awayTeamId, @awayTeamName, @startTime, @status, @seasonYear, @hasOdds, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    league = excluded.league,
    status = excluded.status,
    start_time = excluded.start_time,
    has_odds = excluded.has_odds,
    synced_at = datetime('now')
`);

const upsertOdds = db.prepare(`
  INSERT INTO odds (id, event_id, sportsbook, market, selection, side, team_side, team_name, line, price_american, price_decimal, price_probability, dfs_multiplier, player_id, player_name, suspended, is_main, event_start_time, updated)
  VALUES (@id, @eventId, @sportsbook, @market, @selection, @side, @teamSide, @teamName, @line, @priceAmerican, @priceDecimal, @priceProbability, @dfsMultiplier, @playerId, @playerName, @suspended, @isMain, @eventStartTime, @updated)
  ON CONFLICT(id) DO UPDATE SET
    price_american = excluded.price_american,
    price_decimal = excluded.price_decimal,
    price_probability = excluded.price_probability,
    dfs_multiplier = excluded.dfs_multiplier,
    suspended = excluded.suspended,
    line = excluded.line,
    updated = excluded.updated
`);

const upsertPlayer = db.prepare(`
  INSERT INTO players (id, name, team_id, team_name, league, position, synced_at)
  VALUES (@id, @name, @teamId, @teamName, @league, @position, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    team_id = excluded.team_id,
    team_name = excluded.team_name,
    league = excluded.league,
    position = excluded.position,
    synced_at = datetime('now')
`);

const upsertTeam = db.prepare(`
  INSERT INTO teams (id, name, league, abbreviation, synced_at)
  VALUES (@id, @name, @league, @abbreviation, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, league = excluded.league, synced_at = datetime('now')
`);

const upsertEdge = db.prepare(`
  INSERT INTO edges (id, event_id, player_id, player_name, league, market, selection, line, dfs_source, dfs_multiplier, sportsbook, price_american, price_decimal, fair_decimal, edge_percent, updated)
  VALUES (@id, @eventId, @playerId, @playerName, @league, @market, @selection, @line, @dfsSource, @dfsMultiplier, @sportsbook, @priceAmerican, @priceDecimal, @fairDecimal, @edgePercent, @updated)
  ON CONFLICT(id) DO UPDATE SET
    edge_percent = excluded.edge_percent,
    price_decimal = excluded.price_decimal,
    fair_decimal = excluded.fair_decimal,
    updated = excluded.updated
`);

const upsertArbitrage = db.prepare(`
  INSERT INTO arbitrage (id, event_id, league, market, selection1, selection2, book1, book2, price1_decimal, price2_decimal, profit_percent, stake1_percent, stake2_percent, updated)
  VALUES (@id, @eventId, @league, @market, @selection1, @selection2, @book1, @book2, @price1Decimal, @price2Decimal, @profitPercent, @stake1Percent, @stake2Percent, @updated)
  ON CONFLICT(id) DO UPDATE SET
    profit_percent = excluded.profit_percent,
    price1_decimal = excluded.price1_decimal,
    price2_decimal = excluded.price2_decimal,
    updated = excluded.updated
`);

const insertHistory = db.prepare(`
  INSERT OR IGNORE INTO price_history (id, event_id, sportsbook, market, selection, side, line, price_decimal, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

export function writeEvents(events: SwEvent[]): number {
  const tx = db.transaction((rows: SwEvent[]) => {
    for (const row of rows) upsertEvent.run(row);
  });
  tx(events);
  return events.length;
}

export function writeOdds(rows: SwOddsRow[]): number {
  const tx = db.transaction((data: SwOddsRow[]) => {
    for (const row of data) {
      upsertOdds.run(row);
      insertHistory.run(
        row.id,
        row.eventId,
        row.sportsbook,
        row.market,
        row.selection,
        row.side,
        row.line,
        row.priceDecimal,
      );
    }
  });
  tx(rows);
  return rows.length;
}

export function writePlayers(players: SwPlayer[]): number {
  const tx = db.transaction((rows: SwPlayer[]) => {
    for (const row of rows) upsertPlayer.run(row);
  });
  tx(players);
  return players.length;
}

export function writeTeams(teams: SwTeam[]): number {
  const tx = db.transaction((rows: SwTeam[]) => {
    for (const row of rows) upsertTeam.run(row);
  });
  tx(teams);
  return teams.length;
}

export function writeEdges(edges: SwEdge[]): number {
  const tx = db.transaction((rows: SwEdge[]) => {
    for (const row of rows) upsertEdge.run(row);
  });
  tx(edges);
  return edges.length;
}

export function writeArbitrage(arbs: SwArbitrage[]): number {
  const tx = db.transaction((rows: SwArbitrage[]) => {
    for (const row of rows) upsertArbitrage.run(row);
  });
  tx(arbs);
  return arbs.length;
}

export async function bootstrapReference(): Promise<void> {
  console.log("[sync] bootstrapping reference data...");
  const leagues = await sw.leagues();
  setSyncState("leagues", JSON.stringify(leagues));
  console.log(`[sync] ${leagues.length} leagues: ${leagues.join(", ")}`);

  const books = await sw.sportsbooks();
  setSyncState("sportsbooks", JSON.stringify(books));
  console.log(`[sync] ${books.length} sportsbooks`);

  for (const league of leagues) {
    const teams = await sw.teams(league);
    writeTeams(teams);
    console.log(`[sync] ${league}: ${teams.length} teams`);
  }
}

export async function bootstrapEvents(): Promise<number> {
  console.log("[sync] bootstrapping events...");
  const events = await sw.events();
  writeEvents(events);
  console.log(`[sync] ${events.length} events stored`);
  return events.length;
}

export async function bootstrapOdds(): Promise<number> {
  console.log("[sync] bootstrapping odds (this may take a while)...");
  const odds = await sw.odds({ odds_format: "decimal" });
  writeOdds(odds);
  console.log(`[sync] ${odds.length} odds rows stored`);
  return odds.length;
}

export async function bootstrapEdges(): Promise<number> {
  console.log("[sync] bootstrapping edges...");
  const edges = await sw.edges();
  writeEdges(edges);
  console.log(`[sync] ${edges.length} edges stored`);
  return edges.length;
}

export async function bootstrapArbitrage(): Promise<number> {
  console.log("[sync] bootstrapping arbitrage...");
  const arbs = await sw.arbitrage();
  writeArbitrage(arbs);
  console.log(`[sync] ${arbs.length} arbitrage opportunities stored`);
  return arbs.length;
}
