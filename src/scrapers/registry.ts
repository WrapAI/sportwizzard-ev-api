import type { BookScraper, NormalizedOdds, ScrapedEvent, ScraperResult } from "./types.js";
import { db } from "../store/db.js";
import type { ScrapedEvent as ScrapedEventType } from "./types.js";

export interface ScraperRegistryStats {
  activeScrapers: number;
  lastRun: string;
  totalOddsScraped: number;
  errorsByScraper: Record<string, number>;
}

const stats: ScraperRegistryStats = {
  activeScrapers: 0,
  lastRun: "never",
  totalOddsScraped: 0,
  errorsByScraper: {},
};

const activeScrapers = new Map<string, BookScraper>();

const upsertScrapedEvent = db.prepare(`
  INSERT OR REPLACE INTO events (id, league, home_team_id, home_team_name, away_team_id, away_team_name, start_time, status, season_year, has_odds, synced_at)
  VALUES (@id, @league, @homeTeamId, @homeTeamName, @awayTeamId, @awayTeamName, @startTime, @status, NULL, @hasOdds, datetime('now'))
`);

const upsertScrapedOdds = db.prepare(`
  INSERT INTO odds (id, event_id, sportsbook, market, selection, side, team_side, team_name, line, price_american, price_decimal, price_probability, dfs_multiplier, player_id, player_name, suspended, is_main, event_start_time, updated)
  VALUES (@id, @eventId, @sportsbook, @market, @selection, @side, @teamSide, @teamName, @line, @priceAmerican, @priceDecimal, @priceProbability, @dfsMultiplier, @playerId, @playerName, @suspended, @isMain, @eventStartTime, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    price_american = excluded.price_american,
    price_decimal = excluded.price_decimal,
    price_probability = excluded.price_probability,
    dfs_multiplier = excluded.dfs_multiplier,
    suspended = excluded.suspended,
    updated = datetime('now')
`);

const insertHistory = db.prepare(`
  INSERT OR IGNORE INTO price_history (id, event_id, sportsbook, market, selection, side, line, price_decimal, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

export function registerScraper(scraper: BookScraper): void {
  activeScrapers.set(scraper.bookId, scraper);
  stats.activeScrapers = activeScrapers.size;
  console.log(`[scrapers] registered: ${scraper.displayName} (${scraper.bookId})`);
}

export function getScraper(bookId: string): BookScraper | null {
  return activeScrapers.get(bookId) ?? null;
}

export function listScrapers(): Array<{
  bookId: string;
  displayName: string;
  category: string;
  requiresAuth: boolean;
  requiresBrowser: boolean;
}> {
  return [...activeScrapers.values()].map((s) => ({
    bookId: s.bookId,
    displayName: s.displayName,
    category: s.category,
    requiresAuth: s.requiresAuth,
    requiresBrowser: s.requiresBrowser,
  }));
}

export async function runScraper(bookId: string): Promise<ScraperResult> {
  const scraper = activeScrapers.get(bookId);
  if (!scraper) throw new Error(`Scraper not registered: ${bookId}`);

  const start = Date.now();
  const result: ScraperResult = {
    book: bookId,
    status: "running",
    eventsScraped: 0,
    oddsScraped: 0,
    errors: [],
    durationMs: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    const [events, odds] = await Promise.all([
      scraper.scrape().catch((e) => {
        result.errors.push(`events: ${e instanceof Error ? e.message : "unknown"}`);
        return [] as ScrapedEventType[];
      }),
      scraper.scrapeOdds().catch((e) => {
        result.errors.push(`odds: ${e instanceof Error ? e.message : "unknown"}`);
        return [] as NormalizedOdds[];
      }),
    ]);

    const toInt = (v: unknown): number | null => (v === null || v === undefined ? null : v ? 1 : 0);

    const tx = db.transaction(() => {
      for (const event of events) {
        upsertScrapedEvent.run({ ...event, hasOdds: toInt(event.hasOdds) as unknown as boolean });
      }
      for (const odd of odds) {
        const id = `${odd.sportsbook}_${odd.eventId}_${odd.market}_${odd.selection}_${odd.side ?? ""}_${odd.line ?? ""}`;
        upsertScrapedOdds.run({
          ...odd,
          id,
          suspended: toInt(odd.suspended) as unknown as boolean,
          isMain: toInt(odd.isMain) as unknown as boolean,
        });
        insertHistory.run(id, odd.eventId, odd.sportsbook, odd.market, odd.selection, odd.side, odd.line, odd.priceDecimal);
      }
    });
    tx();

    result.eventsScraped = events.length;
    result.oddsScraped = odds.length;
    result.status = result.errors.length > 0 ? "error" : "idle";
  } catch (error) {
    result.status = "error";
    result.errors.push(error instanceof Error ? error.message : "unknown error");
    stats.errorsByScraper[bookId] = (stats.errorsByScraper[bookId] ?? 0) + 1;
  }

  result.durationMs = Date.now() - start;
  stats.lastRun = new Date().toISOString();
  stats.totalOddsScraped += result.oddsScraped;

  return result;
}

export async function runAllScrapers(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  for (const bookId of activeScrapers.keys()) {
    const result = await runScraper(bookId);
    results.push(result);
    console.log(
      `[scrapers] ${result.book}: ${result.oddsScraped} odds, ${result.eventsScraped} events, ${result.durationMs}ms${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
    );
  }
  return results;
}

export async function healthCheckAll(): Promise<Array<{ book: string; ok: boolean; message: string }>> {
  const checks: Array<{ book: string; ok: boolean; message: string }> = [];
  for (const [bookId, scraper] of activeScrapers) {
    const check = await scraper.healthCheck();
    checks.push({ book: bookId, ...check });
  }
  return checks;
}

export function getScraperStats(): ScraperRegistryStats {
  return { ...stats };
}
