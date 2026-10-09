import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const PP_BASE = "https://partner-api.prizepicks.com/api/v1";
const PP_PROJECTIONS = `${PP_BASE}/projections?per_page=1000`;
const PP_LEAGUES = `${PP_BASE}/leagues`;

interface PpProjection {
  id: string;
  type: string;
  attributes: {
    description?: string;
    line_score?: number;
    status?: string;
    start_time?: string;
    stat_type?: string;
    projection_type?: string;
    odds_type?: string;
    odds_price?: number;
  };
  relationships: {
    new_player?: {
      data?: {
        id: string;
        attributes?: {
          name?: string;
          position?: string;
          team_name?: string;
          league_name?: string;
        };
      };
    };
    new_event?: {
      data?: {
        id: string;
        attributes?: {
          start_time?: string;
          home_team_name?: string;
          away_team_name?: string;
          league_name?: string;
        };
      };
    };
  };
}

interface PpResponse {
  data: PpProjection[];
  included?: unknown[];
  meta?: { next?: { uri?: string } };
}

function mapPpStatToMarket(statType: string): string {
  const lower = statType.toLowerCase();
  if (lower.includes("points") || lower.includes("pts")) return "PLAYER_TOTAL_POINTS";
  if (lower.includes("rebounds") || lower.includes("reb")) return "PLAYER_TOTAL_REBOUNDS";
  if (lower.includes("assists") || lower.includes("ast")) return "PLAYER_TOTAL_ASSISTS";
  if (lower.includes("touchdown") || lower.includes("td")) return "PLAYER_TOTAL_TD";
  if (lower.includes("yard")) return "PLAYER_TOTAL_YARDS";
  if (lower.includes("strikeout")) return "PLAYER_TOTAL_SO";
  if (lower.includes("hit") || lower.includes("hitter")) return "PLAYER_TOTAL_HITS";
  if (lower.includes("goal") || lower.includes("g")) return "PLAYER_TOTAL_GOALS";
  if (lower.includes("save")) return "PLAYER_TOTAL_SAVES";
  if (lower.includes("base") || lower.includes("bb")) return "PLAYER_TOTAL_WALKS";
  return `PLAYER_${statType.replace(/\s+/g, "_").toUpperCase()}`;
}

function ppLeagueToSwLeague(leagueName: string): string {
  const lower = leagueName.toLowerCase();
  if (lower.includes("nfl") || lower.includes("football")) return "nfl";
  if (lower.includes("nba") || lower.includes("basketball")) return "nba";
  if (lower.includes("mlb") || lower.includes("baseball")) return "mlb";
  if (lower.includes("nhl") || lower.includes("hockey")) return "nhl";
  if (lower.includes("cfb") || lower.includes("ncaa football")) return "cfb";
  if (lower.includes("cbb") || lower.includes("ncaa basketball")) return "cbb";
  if (lower.includes("wnba")) return "wnba";
  if (lower.includes("soccer") || lower.includes("mls")) return "mls";
  if (lower.includes("mma") || lower.includes("ufc")) return "mma";
  if (lower.includes("tennis")) return "tennis";
  if (lower.includes("esports")) return "cs2";
  return lower;
}

export class PrizePicksScraper implements BookScraper {
  readonly bookId = "prizepicks";
  readonly displayName = "PrizePicks";
  readonly category = "dfs" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  async scrape(): Promise<ScrapedEvent[]> {
    const response = await fetch(PP_PROJECTIONS, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`PrizePicks failed: ${response.status}`);

    const data = (await response.json()) as PpResponse;
    const eventMap = new Map<string, ScrapedEvent>();

    for (const projection of data.data) {
      const event = projection.relationships?.new_event?.data;
      if (!event?.id || eventMap.has(event.id)) continue;

      eventMap.set(event.id, {
        id: `pp_${event.id}`,
        league: ppLeagueToSwLeague(event.attributes?.league_name ?? ""),
        homeTeamId: "",
        homeTeamName: event.attributes?.home_team_name ?? "",
        awayTeamId: "",
        awayTeamName: event.attributes?.away_team_name ?? "",
        startTime: event.attributes?.start_time ?? "",
        status: "scheduled",
        hasOdds: true,
      });
    }

    return [...eventMap.values()];
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    let url: string | null = PP_PROJECTIONS;
    const odds: NormalizedOdds[] = [];

    while (url) {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) break;

      const data = (await response.json()) as PpResponse;

      for (const projection of data.data) {
        if (projection.attributes?.status !== "final") continue;

        const player = projection.relationships?.new_player?.data;
        const event = projection.relationships?.new_event?.data;
        const lineScore = projection.attributes?.line_score ?? 0;
        const statType = projection.attributes?.stat_type ?? "";
        const market = mapPpStatToMarket(statType);
        const multiplier = projection.attributes?.odds_price ?? 2.0;

        for (const side of ["OVER", "UNDER"] as const) {
          odds.push({
            eventId: `pp_${event?.id ?? "unknown"}`,
            sportsbook: "prizepicks",
            market,
            selection: `${side} ${lineScore} ${statType}`,
            side,
            teamSide: null,
            teamName: player?.attributes?.team_name ?? null,
            line: lineScore,
            priceAmerican: null,
            priceDecimal: null,
            priceProbability: null,
            dfsMultiplier: multiplier,
            playerId: player?.id ?? null,
            playerName: player?.attributes?.name ?? null,
            suspended: projection.attributes?.status !== "final",
            eventStartTime: event?.attributes?.start_time ?? "",
            isMain: true,
          });
        }
      }

      url = data.meta?.next?.uri ?? null;
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(PP_LEAGUES, { headers: { Accept: "application/json" } });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
