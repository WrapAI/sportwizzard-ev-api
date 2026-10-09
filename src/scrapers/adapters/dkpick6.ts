import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const DKP6_BASE = "https://sportsbook.draftkings.com/api/sportscontent/dkp6us/v1";
const DKP6_LEAGUE = "42648";

interface Dkp6Response {
  events?: Array<{
    id: string;
    name?: string;
    startDate?: string;
    homeTeam?: { name?: string };
    awayTeam?: { name?: string };
    offers?: Array<{
      label?: string;
      outcomes?: Array<{
        id: string;
        label?: string;
        oddsAmerican?: string;
        oddsDecimal?: number;
        line?: number;
        participant?: string;
        suspended?: boolean;
      }>;
    }>;
  }>;
}

export class DkPick6Scraper implements BookScraper {
  readonly bookId = "dkpick6";
  readonly displayName = "DK Pick6";
  readonly category = "dfs" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  async scrape(): Promise<ScrapedEvent[]> {
    const response = await fetch(`${DKP6_BASE}/leagues/${DKP6_LEAGUE}/categories`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`DK Pick6 failed: ${response.status}`);

    const data = (await response.json()) as Dkp6Response;
    const events: ScrapedEvent[] = [];

    for (const ev of data.events ?? []) {
      events.push({
        id: `dkp6_${ev.id}`,
        league: "nfl",
        homeTeamId: "",
        homeTeamName: ev.homeTeam?.name ?? "",
        awayTeamId: "",
        awayTeamName: ev.awayTeam?.name ?? "",
        startTime: ev.startDate ?? "",
        status: "scheduled",
        hasOdds: true,
      });
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const response = await fetch(`${DKP6_BASE}/leagues/${DKP6_LEAGUE}/categories`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];

    const data = (await response.json()) as Dkp6Response;
    const odds: NormalizedOdds[] = [];

    for (const ev of data.events ?? []) {
      for (const offer of ev.offers ?? []) {
        for (const outcome of offer.outcomes ?? []) {
          if (outcome.suspended) continue;
          const decimal = outcome.oddsDecimal ?? 0;
          const label = (outcome.label ?? "").toLowerCase();
          const side = label.includes("over") ? "OVER" : label.includes("under") ? "UNDER" : null;

          odds.push({
            eventId: `dkp6_${ev.id}`,
            sportsbook: "dkpick6",
            market: offer.label ?? "UNKNOWN",
            selection: outcome.label ?? "",
            side,
            teamSide: null,
            teamName: outcome.participant ?? null,
            line: outcome.line ?? null,
            priceAmerican: outcome.oddsAmerican ?? null,
            priceDecimal: decimal > 1 ? decimal : null,
            priceProbability: decimal > 1 ? 1 / decimal : null,
            dfsMultiplier: null,
            playerId: null,
            playerName: outcome.participant ?? null,
            suspended: false,
            eventStartTime: ev.startDate ?? "",
            isMain: true,
          });
        }
      }
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${DKP6_BASE}/leagues/${DKP6_LEAGUE}/categories`, {
        headers: { Accept: "application/json" },
      });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
