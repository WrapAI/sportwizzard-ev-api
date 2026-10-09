export type ScraperStatus = "idle" | "running" | "error" | "disabled";

export interface NormalizedOdds {
  eventId: string;
  sportsbook: string;
  market: string;
  selection: string;
  side: string | null;
  teamSide: string | null;
  teamName: string | null;
  line: number | null;
  priceAmerican: string | null;
  priceDecimal: number | null;
  priceProbability: number | null;
  dfsMultiplier: number | null;
  playerId: string | null;
  playerName: string | null;
  suspended: boolean;
  eventStartTime: string;
  isMain: boolean;
}

export interface ScrapedEvent {
  id: string;
  league: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  startTime: string;
  status: string;
  hasOdds: boolean;
}

export interface ScraperResult {
  book: string;
  status: ScraperStatus;
  eventsScraped: number;
  oddsScraped: number;
  errors: string[];
  durationMs: number;
  timestamp: string;
}

export interface BookScraper {
  readonly bookId: string;
  readonly displayName: string;
  readonly category: "sportsbook" | "dfs" | "prediction_market";
  readonly requiresAuth: boolean;
  readonly requiresBrowser: boolean;
  scrape(): Promise<ScrapedEvent[]>;
  scrapeOdds(eventId?: string): Promise<NormalizedOdds[]>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
