import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const BOV_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Origin: "https://www.bovada.lv",
  Referer: "https://www.bovada.lv/",
};

const BOVADA_BASE = "https://www.bovada.lv/services/sports/event/coupon/events/A/description";

interface BovadaEvent {
  id: string;
  link: string;
  description: string;
  startTime: string;
  homeTeamName: string;
  awayTeamName?: string;
  league?: { description?: string };
  displayGroups?: BovadaDisplayGroup[];
}

interface BovadaDisplayGroup {
  code: string;
  description: string;
  markets?: BovadaMarket[];
}

interface BovadaMarket {
  id: string;
  description: string;
  key?: string;
  period?: { description?: string };
  outcomes?: BovadaOutcome[];
}

interface BovadaOutcome {
  id: string;
  description: string;
  price: {
    american: string;
    decimal: number;
    fractional?: string;
  };
  priceHandicap?: {
    american: string;
    decimal: number;
    dHandicap?: { american: string };
  };
  suspended?: boolean;
}

interface BovadaResponse {
  events?: BovadaEvent[];
}

function mapBovadaLeague(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("nfl")) return "nfl";
  if (lower.includes("nba")) return "nba";
  if (lower.includes("mlb")) return "mlb";
  if (lower.includes("nhl")) return "nhl";
  return "unknown";
}

export class BovadaScraper implements BookScraper {
  readonly bookId = "betonline";
  readonly displayName = "Bovada";
  readonly category = "sportsbook" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  private leaguePaths = ["americanfootball/nfl", "basketball/nba", "baseball/mlb", "icehockey/nhl"];

  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];

    for (const league of this.leaguePaths) {
      const url = `${BOVADA_BASE}/${league}`;
      const response = await fetch(url, { headers: BOV_HEADERS });
      if (!response.ok) continue;

      const data = (await response.json()) as BovadaResponse;
      for (const ev of data.events ?? []) {
        events.push({
          id: `bv_${ev.id}`,
          league: mapBovadaLeague(league),
          homeTeamId: "",
          homeTeamName: ev.homeTeamName ?? "",
          awayTeamId: "",
          awayTeamName: ev.awayTeamName ?? "",
          startTime: ev.startTime,
          status: "scheduled",
          hasOdds: true,
        });
      }
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const odds: NormalizedOdds[] = [];

    for (const league of this.leaguePaths) {
      const url = `${BOVADA_BASE}/${league}`;
      const response = await fetch(url, { headers: BOV_HEADERS });
      if (!response.ok) continue;

      const data = (await response.json()) as BovadaResponse;
      for (const ev of data.events ?? []) {
        for (const group of ev.displayGroups ?? []) {
          for (const market of group.markets ?? []) {
            for (const outcome of market.outcomes ?? []) {
              if (outcome.suspended) continue;
              const decimal = outcome.price?.decimal ?? 0;
              if (decimal <= 1) continue;

              const label = outcome.description.toLowerCase();
              const side = label.includes("over") ? "OVER" : label.includes("under") ? "UNDER" : null;

              odds.push({
                eventId: `bv_${ev.id}`,
                sportsbook: "betonline",
                market: market.description ?? "UNKNOWN",
                selection: outcome.description,
                side,
                teamSide: null,
                teamName: null,
                line: null,
                priceAmerican: outcome.price?.american ?? null,
                priceDecimal: decimal,
                priceProbability: 1 / decimal,
                dfsMultiplier: null,
                playerId: null,
                playerName: null,
                suspended: false,
                eventStartTime: ev.startTime,
                isMain: group.code === "MG",
              });
            }
          }
        }
      }
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${BOVADA_BASE}/americanfootball/nfl`, {
        headers: { Accept: "application/json" },
      });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
