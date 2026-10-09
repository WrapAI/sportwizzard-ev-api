import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const MGM_STATES = ["nj", "pa", "mi", "co", "tn", "az", "va", "la", "ny", "oh", "md", "ma", "il", "in", "ia", "ks", "ky", "nc"];
const MGM_CONFIG_PATH = "/sportsbook-configuration/api/v1/clientconfig";
const MGM_FIXTURES_PATH = "/cds-api/bettingoffer/fixtures";

interface MgmConfig {
  accessId?: string;
  region?: string;
}

interface MgmFixture {
  id: string;
  name?: string;
  startTime?: string;
  sport?: string;
  league?: string;
  participants?: Array<{ id: string; name: string }>;
  bettingOffer?: MgmBettingOffer[];
}

interface MgmBettingOffer {
  id: string;
  market?: { name?: string; group?: string };
  outcomes?: Array<{
    id: string;
    name?: string;
    odds?: { american?: string; decimal?: number };
    line?: number;
    status?: string;
  }>;
}

export class BetMgmScraper implements BookScraper {
  readonly bookId = "betmgm";
  readonly displayName = "BetMGM";
  readonly category = "sportsbook" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  private accessIdCache: string | null = null;
  private state = "nj";

  private async getAccessId(): Promise<string | null> {
    if (this.accessIdCache) return this.accessIdCache;

    for (const state of MGM_STATES.slice(0, 3)) {
      const url = `https://sports.${state}.betmgm.com${MGM_CONFIG_PATH}`;
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) continue;

        const config = (await response.json()) as MgmConfig;
        if (config.accessId) {
          this.state = state;
          this.accessIdCache = config.accessId;
          return config.accessId;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  async scrape(): Promise<ScrapedEvent[]> {
    const accessId = await this.getAccessId();
    if (!accessId) throw new Error("BetMGM: could not obtain accessId");

    const url = `https://sports.${this.state}.betmgm.com${MGM_FIXTURES_PATH}?accessId=${accessId}&sport=FOOTBALL&league=NFL&matchStatus=NOT_STARTED`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`BetMGM failed: ${response.status}`);

    const data = (await response.json()) as { fixtures?: MgmFixture[] };
    const events: ScrapedEvent[] = [];

    for (const fixture of data.fixtures ?? []) {
      events.push({
        id: `mgm_${fixture.id}`,
        league: (fixture.league ?? "unknown").toLowerCase(),
        homeTeamId: fixture.participants?.[1]?.id ?? "",
        homeTeamName: fixture.participants?.[1]?.name ?? "",
        awayTeamId: fixture.participants?.[0]?.id ?? "",
        awayTeamName: fixture.participants?.[0]?.name ?? "",
        startTime: fixture.startTime ?? "",
        status: "scheduled",
        hasOdds: true,
      });
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const accessId = await this.getAccessId();
    if (!accessId) return [];

    const url = `https://sports.${this.state}.betmgm.com${MGM_FIXTURES_PATH}?accessId=${accessId}&sport=FOOTBALL&league=NFL&matchStatus=NOT_STARTED`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];

    const data = (await response.json()) as { fixtures?: MgmFixture[] };
    const odds: NormalizedOdds[] = [];

    for (const fixture of data.fixtures ?? []) {
      for (const offer of fixture.bettingOffer ?? []) {
        for (const outcome of offer.outcomes ?? []) {
          if (outcome.status && outcome.status !== "OPEN") continue;
          const decimal = outcome.odds?.decimal ?? 0;
          if (decimal <= 1) continue;

          const label = (outcome.name ?? "").toLowerCase();
          const side = label.includes("over") ? "OVER" : label.includes("under") ? "UNDER" : null;

          odds.push({
            eventId: `mgm_${fixture.id}`,
            sportsbook: "betmgm",
            market: offer.market?.name ?? "UNKNOWN",
            selection: outcome.name ?? "",
            side,
            teamSide: null,
            teamName: null,
            line: outcome.line ?? null,
            priceAmerican: outcome.odds?.american ?? null,
            priceDecimal: decimal,
            priceProbability: 1 / decimal,
            dfsMultiplier: null,
            playerId: null,
            playerName: null,
            suspended: false,
            eventStartTime: fixture.startTime ?? "",
            isMain: true,
          });
        }
      }
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const url = `https://sports.nj.betmgm.com${MGM_CONFIG_PATH}`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      return {
        ok: response.ok,
        message: response.ok ? "Config accessible" : `HTTP ${response.status}`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
