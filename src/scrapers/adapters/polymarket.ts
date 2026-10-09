import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const POLYMARKET_BASE = "https://gamma-api.polymarket.com";

interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate?: string;
  liquidity?: number;
  outcomes?: Array<{ id: string; outcome: string; price: number }>;
  closed?: boolean;
  category?: string;
  tags?: string[];
}

function detectLeagueFromTags(tags?: string[]): string {
  const tagsLower = (tags ?? []).map((t) => t.toLowerCase());
  if (tagsLower.some((t) => t.includes("nfl"))) return "nfl";
  if (tagsLower.some((t) => t.includes("nba"))) return "nba";
  if (tagsLower.some((t) => t.includes("mlb"))) return "mlb";
  if (tagsLower.some((t) => t.includes("nhl"))) return "nhl";
  if (tagsLower.some((t) => t.includes("soccer") || t.includes("epl"))) return "epl";
  if (tagsLower.some((t) => t.includes("tennis"))) return "tennis";
  return "unknown";
}

export class PolymarketScraper implements BookScraper {
  readonly bookId = "polymarket";
  readonly displayName = "Polymarket";
  readonly category = "prediction_market" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  async scrape(): Promise<ScrapedEvent[]> {
    const url = `${POLYMARKET_BASE}/markets?active=true&closed=false&limit=100`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Polymarket failed: ${response.status}`);

    const data = (await response.json()) as PolymarketMarket[];
    const events: ScrapedEvent[] = [];

    for (const market of data) {
      if (market.closed) continue;
      const league = detectLeagueFromTags(market.tags);

      events.push({
        id: `pm_${market.id}`,
        league,
        homeTeamId: "",
        homeTeamName: "",
        awayTeamId: "",
        awayTeamName: market.question,
        startTime: market.endDate ?? "",
        status: "scheduled",
        hasOdds: true,
      });
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const url = `${POLYMARKET_BASE}/markets?active=true&closed=false&limit=100`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];

    const data = (await response.json()) as PolymarketMarket[];
    const odds: NormalizedOdds[] = [];

    for (const market of data) {
      if (market.closed) continue;
      const league = detectLeagueFromTags(market.tags);

      for (const outcome of market.outcomes ?? []) {
        if (outcome.price <= 0 || outcome.price >= 1) continue;

        odds.push({
          eventId: `pm_${market.id}`,
          sportsbook: "polymarket",
          market: "PREDICTION",
          selection: outcome.outcome,
          side: null,
          teamSide: null,
          teamName: null,
          line: null,
          priceAmerican: outcome.price >= 0.5
            ? `+${Math.round((outcome.price / (1 - outcome.price)) * 100)}`
            : `${Math.round(-100 * (1 - outcome.price) / outcome.price)}`,
          priceDecimal: 1 / outcome.price,
          priceProbability: outcome.price,
          dfsMultiplier: null,
          playerId: null,
          playerName: null,
          suspended: false,
          eventStartTime: market.endDate ?? "",
          isMain: true,
        });
      }
      void league;
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${POLYMARKET_BASE}/markets?limit=1`, {
        headers: { Accept: "application/json" },
      });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
