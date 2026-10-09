import type { BookScraper, NormalizedOdds, ScrapedEvent } from "../types.js";

const FD_BASE = "https://sbapi.nj.sportsbook.fanduel.com/api";
const FD_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Origin: "https://sportsbook.fanduel.com",
  Referer: "https://sportsbook.fanduel.com/",
};

interface FdResponse {
  attachments?: {
    events?: FdEvent[];
    markets?: FdMarket[];
    runners?: FdRunner[];
  };
}

interface FdEvent {
  eventId: string;
  name: string;
  startTime: string;
  leagueName?: string;
  homeTeam?: string;
  awayTeam?: string;
}

interface FdMarket {
  marketId: string;
  eventId: string;
  marketType: string;
  marketName?: string;
}

interface FdRunner {
  runnerId: string;
  marketId: string;
  runnerName: string;
  outcome?: string;
  winPrice?: {
    decimal?: number;
    american?: string;
  };
  status?: string;
}

export class FanDuelScraper implements BookScraper {
  readonly bookId = "fanduel";
  readonly displayName = "FanDuel";
  readonly category = "sportsbook" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;

  async scrape(): Promise<ScrapedEvent[]> {
    const url = `${FD_BASE}/content-managed-page?_ak=fiapi&useCustom=true&capiJas&galleryName=nfl&timezone=America/New_York&pageType=static&market=US`;
    const response = await fetch(url, { headers: FD_HEADERS });
    if (!response.ok) throw new Error(`FanDuel failed: ${response.status}`);

    const data = (await response.json()) as FdResponse;
    const events: ScrapedEvent[] = [];

    for (const ev of data.attachments?.events ?? []) {
      events.push({
        id: `fd_${ev.eventId}`,
        league: ev.leagueName?.toLowerCase() ?? "unknown",
        homeTeamId: "",
        homeTeamName: ev.homeTeam ?? "",
        awayTeamId: "",
        awayTeamName: ev.awayTeam ?? "",
        startTime: ev.startTime,
        status: "scheduled",
        hasOdds: true,
      });
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const url = `${FD_BASE}/content-managed-page?_ak=fiapi&useCustom=true&capiJas&galleryName=nfl&timezone=America/New_York&pageType=static&market=US`;
    const response = await fetch(url, { headers: FD_HEADERS });
    if (!response.ok) return [];

    const data = (await response.json()) as FdResponse;
    const odds: NormalizedOdds[] = [];
    const eventMap = new Map<string, FdEvent>();
    for (const ev of data.attachments?.events ?? []) eventMap.set(ev.eventId, ev);

    for (const runner of data.attachments?.runners ?? []) {
      if (runner.status && runner.status !== "active") continue;
      const event = eventMap.get(runner.marketId);
      if (!event) continue;

      const decimal = runner.winPrice?.decimal ?? 0;
      const label = runner.runnerName.toLowerCase();
      const side = label.includes("over") ? "OVER" : label.includes("under") ? "UNDER" : null;

      odds.push({
        eventId: `fd_${event.eventId}`,
        sportsbook: "fanduel",
        market: "UNKNOWN",
        selection: runner.runnerName,
        side,
        teamSide: null,
        teamName: null,
        line: null,
        priceAmerican: runner.winPrice?.american ?? null,
        priceDecimal: decimal > 1 ? decimal : null,
        priceProbability: decimal > 1 ? 1 / decimal : null,
        dfsMultiplier: null,
        playerId: null,
        playerName: null,
        suspended: false,
        eventStartTime: event.startTime,
        isMain: true,
      });
    }

    return odds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${FD_BASE}/content-managed-page?_ak=fiapi`, {
        headers: { Accept: "application/json" },
      });
      return { ok: response.ok, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "failed" };
    }
  }
}
