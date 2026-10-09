import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  open_interest?: number;
  volume?: number;
  status?: string;
  close_time?: string;
}

interface KalshiResponse {
  markets?: KalshiMarket[];
  cursor?: string;
}

function centsToDecimal(cents: number): number {
  return cents / 100;
}

function centsToAmerican(cents: number): string {
  const decimal = centsToDecimal(cents);
  if (decimal >= 1.0) return "+100";
  if (decimal >= 0.5) return `+${Math.round((decimal / (1 - decimal)) * 100)}`;
  return `${Math.round(-100 * (1 - decimal) / decimal)}`;
}

export class KalshiScraper implements BookScraper {
  readonly bookId = "kalshi";
  readonly displayName = "Kalshi";
  readonly category = "prediction_market" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  async scrape(): Promise<ScrapedEvent[]> {
    const url = `${KALSHI_BASE}/markets?status=open&limit=200`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Kalshi failed: ${response.status}`);

    const data = (await response.json()) as KalshiResponse;
    const events: ScrapedEvent[] = [];

    for (const market of data.markets ?? []) {
      events.push({
        id: `ks_${market.ticker}`,
        league: "prediction",
        homeTeamId: "",
        homeTeamName: "",
        awayTeamId: "",
        awayTeamName: market.title,
        startTime: market.close_time ?? "",
        status: "scheduled",
        hasOdds: true,
      });
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    let cursor: string | null = null;
    const odds: NormalizedOdds[] = [];

    do {
      const url = new URL(`${KALSHI_BASE}/markets`);
      url.searchParams.set("status", "open");
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) break;

      const data = (await response.json()) as KalshiResponse;

      for (const market of data.markets ?? []) {
        const marketOdds: Array<{ selection: string; cents: number }> = [];
        if (market.yes_ask && market.yes_ask > 0) marketOdds.push({ selection: "YES", cents: market.yes_ask });
        if (market.no_ask && market.no_ask > 0) marketOdds.push({ selection: "NO", cents: market.no_ask });

        for (const { selection, cents } of marketOdds) {
          if (cents <= 0 || cents >= 100) continue;
          const decimal = centsToDecimal(cents);

          odds.push({
            eventId: `ks_${market.ticker}`,
            sportsbook: "kalshi",
            market: "PREDICTION",
            selection,
            side: selection === "YES" ? "OVER" : "UNDER",
            teamSide: null,
            teamName: null,
            line: null,
            priceAmerican: centsToAmerican(cents),
            priceDecimal: decimal > 1 ? decimal : null,
            priceProbability: decimal > 0 && decimal < 1 ? decimal : null,
            dfsMultiplier: null,
            playerId: null,
            playerName: null,
            suspended: false,
            eventStartTime: market.close_time ?? "",
            isMain: true,
          });
        }
      }

      cursor = data.cursor ?? null;
    } while (cursor);

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${KALSHI_BASE}/markets?limit=1`, {
        headers: { Accept: "application/json" },
      });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
