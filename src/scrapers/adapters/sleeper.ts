import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const SLEEPER_BASE = "https://api.sleeper.com/v1/players";
const SLEEPER_TRENDS = "https://api.sleeper.com/v1/players/nfl/trending/add";

interface SleeperPlayer {
  player_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  team?: string;
  position?: string;
  status?: string;
  fantasy_positions?: string[];
}

interface SleeperProjection {
  player_id: string;
  projection?: number;
  stat_type?: string;
}

export class SleeperScraper implements BookScraper {
  readonly bookId = "sleeper";
  readonly displayName = "Sleeper";
  readonly category = "dfs" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  private leagues = ["nfl", "nba", "mlb", "nhl"];

  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    for (const league of this.leagues) {
      events.push({
        id: `sl_${league}_board`,
        league,
        homeTeamId: "",
        homeTeamName: "",
        awayTeamId: "",
        awayTeamName: `${league.toUpperCase()} Projections`,
        startTime: new Date().toISOString(),
        status: "scheduled",
        hasOdds: true,
      });
    }
    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const odds: NormalizedOdds[] = [];

    for (const league of this.leagues) {
      const url = `${SLEEPER_BASE}/${league}`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;

      const data = (await response.json()) as Record<string, SleeperPlayer>;
      for (const [playerId, player] of Object.entries(data)) {
        if (!player.full_name) continue;

        for (const side of ["OVER", "UNDER"] as const) {
          odds.push({
            eventId: `sl_${league}_board`,
            sportsbook: "sleeper",
            market: "PLAYER_TOTAL",
            selection: `${side} ${player.full_name}`,
            side,
            teamSide: null,
            teamName: player.team ?? null,
            line: null,
            priceAmerican: null,
            priceDecimal: null,
            priceProbability: null,
            dfsMultiplier: 2.0,
            playerId,
            playerName: player.full_name,
            suspended: player.status !== "Active",
            eventStartTime: new Date().toISOString(),
            isMain: true,
          });
        }
      }
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${SLEEPER_BASE}/nfl`, { headers: { Accept: "application/json" } });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
