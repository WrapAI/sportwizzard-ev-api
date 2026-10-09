import Database from "better-sqlite3";
import { config } from "../config.js";

import type DatabaseType from "better-sqlite3";
export const db: DatabaseType.Database = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      league TEXT NOT NULL,
      home_team_id TEXT,
      home_team_name TEXT,
      away_team_id TEXT,
      away_team_name TEXT,
      start_time TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      season_year INTEGER,
      has_odds INTEGER DEFAULT 0,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_league ON events(league);
    CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

    CREATE TABLE IF NOT EXISTS odds (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id),
      sportsbook TEXT NOT NULL,
      market TEXT NOT NULL,
      selection TEXT NOT NULL,
      side TEXT,
      team_side TEXT,
      team_name TEXT,
      line REAL,
      price_american TEXT,
      price_decimal REAL,
      price_probability REAL,
      dfs_multiplier REAL,
      player_id TEXT,
      player_name TEXT,
      suspended INTEGER DEFAULT 0,
      is_main INTEGER DEFAULT 0,
      event_start_time TEXT,
      updated TEXT NOT NULL,
      UNIQUE(event_id, sportsbook, market, selection, line, side, player_id)
    );

    CREATE INDEX IF NOT EXISTS idx_odds_event ON odds(event_id);
    CREATE INDEX IF NOT EXISTS idx_odds_player ON odds(player_id);
    CREATE INDEX IF NOT EXISTS idx_odds_market ON odds(market);
    CREATE INDEX IF NOT EXISTS idx_odds_book ON odds(sportsbook);
    CREATE INDEX IF NOT EXISTS idx_odds_updated ON odds(updated);

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT,
      team_name TEXT,
      league TEXT,
      position TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_players_league ON players(league);
    CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      league TEXT NOT NULL,
      abbreviation TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league);

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      event_id TEXT,
      player_id TEXT,
      player_name TEXT,
      league TEXT,
      market TEXT,
      selection TEXT,
      line REAL,
      dfs_source TEXT,
      dfs_multiplier REAL,
      sportsbook TEXT,
      price_american TEXT,
      price_decimal REAL,
      fair_decimal REAL,
      edge_percent REAL,
      updated TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_edges_percent ON edges(edge_percent DESC);
    CREATE INDEX IF NOT EXISTS idx_edges_league ON edges(league);
    CREATE INDEX IF NOT EXISTS idx_edges_updated ON edges(updated);

    CREATE TABLE IF NOT EXISTS arbitrage (
      id TEXT PRIMARY KEY,
      event_id TEXT,
      league TEXT,
      market TEXT,
      selection1 TEXT,
      selection2 TEXT,
      book1 TEXT,
      book2 TEXT,
      price1_decimal REAL,
      price2_decimal REAL,
      profit_percent REAL,
      stake1_percent REAL,
      stake2_percent REAL,
      updated TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_arb_profit ON arbitrage(profit_percent DESC);
    CREATE INDEX IF NOT EXISTS idx_arb_updated ON arbitrage(updated);

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT,
      event_id TEXT NOT NULL,
      sportsbook TEXT NOT NULL,
      market TEXT NOT NULL,
      selection TEXT NOT NULL,
      side TEXT,
      line REAL,
      price_decimal REAL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (id, recorded_at)
    );

    CREATE INDEX IF NOT EXISTS idx_history_event ON price_history(event_id);
    CREATE INDEX IF NOT EXISTS idx_history_recorded ON price_history(recorded_at);

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function getSyncState(key: string): string | null {
  const row = db.prepare("SELECT value FROM sync_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string): void {
  db.prepare(
    "INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
  ).run(key, value);
}
