import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const DK_BASE = "https://sportsbook-nash.draftkings.com/api/sportscontent/dkusnj/v1";
const DK_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Origin: "https://sportsbook.draftkings.com",
  Referer: "https://sportsbook.draftkings.com/",
};
const DK_PICK6_BASE = "https://sportsbook.draftkings.com/api/sportscontent/dkp6us/v1";
const DK_CATEGORY = "493";

interface DkEvent {
  offers?: DkOffer[];
  id: string;
  name?: string;
  leagueName?: string;
  startDate?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  events?: DkSubEvent[];
}

interface DkSubEvent {
  id: string;
  name?: string;
  startDate?: string;
  homeTeam?: { name?: string; id?: string };
  awayTeam?: { name?: string; id?: string };
}

interface DkOffer {
  id: string;
  label?: string;
  outcomes?: DkOutcome[];
}

interface DkOutcome {
  id: string;
  label?: string;
  oddsAmerican?: string;
  oddsDecimal?: number;
  line?: number;
  participant?: string;
  suspended?: boolean;
}

interface DkResponse {
  events?: DkEvent[];
  offers?: DkOffer[];
}

export class DraftKingsScraper implements BookScraper {
  readonly bookId = "draftkings";
  readonly displayName = "DraftKings";
  readonly category = "sportsbook" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  async scrape(): Promise<ScrapedEvent[]> {
    const url = `${DK_BASE}/leagues/${DK_CATEGORY}/categories/${DK_CATEGORY}`;
    const response = await fetch(url, { headers: DK_HEADERS });
    if (!response.ok) throw new Error(`DK events failed: ${response.status}`);

    const data = (await response.json()) as DkResponse;
    const events: ScrapedEvent[] = [];

    for (const dkEvent of data.events ?? []) {
      for (const subEvent of dkEvent.events ?? []) {
        events.push({
          id: `dk_${subEvent.id}`,
          league: "nfl",
          homeTeamId: subEvent.homeTeam?.id ?? "",
          homeTeamName: subEvent.homeTeam?.name ?? "",
          awayTeamId: subEvent.awayTeam?.id ?? "",
          awayTeamName: subEvent.awayTeam?.name ?? "",
          startTime: subEvent.startDate ?? "",
          status: "scheduled",
          hasOdds: true,
        });
      }
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const url = `${DK_BASE}/leagues/${DK_CATEGORY}/categories/${DK_CATEGORY}`;
    const response = await fetch(url, { headers: DK_HEADERS });
    if (!response.ok) return [];

    const data = (await response.json()) as DkResponse;
    const odds: NormalizedOdds[] = [];

    for (const dkEvent of data.events ?? []) {
      for (const offer of dkEvent.offers ?? []) {
        const market = offer.label ?? "UNKNOWN";
        for (const outcome of offer.outcomes ?? []) {
          if (outcome.suspended) continue;
          const decimal = outcome.oddsDecimal ?? 0;
          const american = outcome.oddsAmerican ?? "";
          const label = (outcome.label ?? "").toLowerCase();
          const side = label.includes("over") ? "OVER" : label.includes("under") ? "UNDER" : null;

          odds.push({
            eventId: `dk_${dkEvent.id}`,
            sportsbook: "draftkings",
            market,
            selection: outcome.label ?? "",
            side,
            teamSide: null,
            teamName: outcome.participant ?? null,
            line: outcome.line ?? null,
            priceAmerican: american || null,
            priceDecimal: decimal > 1 ? decimal : null,
            priceProbability: decimal > 1 ? 1 / decimal : null,
            dfsMultiplier: null,
            playerId: null,
            playerName: null,
            suspended: false,
            eventStartTime: dkEvent.startDate ?? "",
            isMain: true,
          });
        }
      }
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${DK_BASE}/leagues/${DK_CATEGORY}/categories/${DK_CATEGORY}`, { headers: DK_HEADERS });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
