import type { BookScraper, NormalizedOdds, ScrapedEvent, ScraperResult } from "../types.js";
import { KAMBI_OPERATORS, KAMBI_LEAGUE_MAP, kambiOperatorUrl, type KambiOperatorCode } from "./config.js";

interface KambiEvent {
  event: {
    id: string;
    name: string;
    sport: string;
    league: string;
    startTime: string;
    homeName: string;
    awayName: string;
    homeId?: string;
    awayId?: string;
    openForLiveBetting?: boolean;
  };
  mainOffer: {
    offerId?: string;
    outcomes: KambiOutcome[];
  }[];
  betOffers?: KambiBetOffer[];
}

interface KambiBetOffer {
  betOfferId: string;
  criterion: { id: number; label: string; marketType?: string };
  outcomes: KambiOutcome[];
}

interface KambiOutcome {
  id: string;
  label: string;
  odds: number;
  oddsFractional?: string;
  line?: number;
  participant?: string;
  productId?: number;
  cancelled?: boolean;
  suspended?: boolean;
}

interface KambiResponse {
  events?: KambiEvent[];
  groupBy?: unknown;
}

function americanFromKambiOdds(kambiOdds: number): { american: string; decimal: number } {
  const decimal = kambiOdds / 1000;
  let american: string;
  if (decimal >= 2.0) {
    american = `+${Math.round((decimal - 1) * 100)}`;
  } else {
    american = `${Math.round(-100 / (decimal - 1))}`;
  }
  return { american, decimal };
}

function mapKambiMarket(criterionLabel: string): string {
  const lower = criterionLabel.toLowerCase();
  if (lower.includes("money line") || lower.includes("match winner")) return "MONEYLINE";
  if (lower.includes("spread") || lower.includes("handicap")) return "SPREAD";
  if (lower.includes("total") && lower.includes("game")) return "TOTAL";
  if (lower.includes("total") && (lower.includes("player") || lower.includes("points"))) return "PLAYER_TOTAL";
  if (lower.includes("will ") || lower.includes("yes") || lower.includes("no")) return "PLAYER_YES_NO";
  if (lower.includes("milestone") || lower.includes("record")) return "PLAYER_MILESTONE";
  if (lower.includes("team total")) return "TEAM_TOTAL";
  return `CUSTOM_${criterionLabel.replace(/\s+/g, "_").toUpperCase()}`;
}

function normalizeKambiOutcome(
  outcome: KambiOutcome,
  event: KambiEvent,
  sportsbook: string,
): NormalizedOdds {
  const { american, decimal } = americanFromKambiOdds(outcome.odds);
  const label = (outcome.label ?? "").toLowerCase();
  const side = label.includes("over") ? "OVER" : label.includes("under") ? "UNDER" : null;
  const teamSide = label.includes(event.event.homeName?.toLowerCase() ?? "") ? "HOME"
    : label.includes(event.event.awayName?.toLowerCase() ?? "") ? "AWAY" : null;

  return {
    eventId: `kambi_${event.event.id}`,
    sportsbook,
    market: mapKambiMarket(event.betOffers?.[0]?.criterion?.label ?? ""),
    selection: outcome.label,
    side,
    teamSide,
    teamName: outcome.participant ?? null,
    line: outcome.line ?? null,
    priceAmerican: american,
    priceDecimal: decimal,
    priceProbability: 1 / decimal,
    dfsMultiplier: null,
    playerId: null,
    playerName: null,
    suspended: outcome.suspended ?? false,
    eventStartTime: event.event.startTime,
    isMain: true,
  };
}

export class KambiScraper implements BookScraper {
  readonly bookId: string;
  readonly displayName: string;
  readonly category = "sportsbook" as const;
  readonly requiresAuth = false;
  readonly requiresBrowser = false;
  private operator: KambiOperatorCode;

  constructor(operator: KambiOperatorCode) {
    this.operator = operator;
    this.bookId = operator;
    this.displayName = KAMBI_OPERATORS[operator];
  }

  async scrape(): Promise<ScrapedEvent[]> {
    const events: ScrapedEvent[] = [];
    const leagueCodes = Object.keys(KAMBI_LEAGUE_MAP).slice(0, 5);

    for (const league of leagueCodes) {
      const url = kambiOperatorUrl(this.operator, KAMBI_LEAGUE_MAP[league]);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;

      const data = (await response.json()) as KambiResponse;
      if (!data.events) continue;

      for (const kambiEvent of data.events) {
        events.push({
          id: `kambi_${kambiEvent.event.id}`,
          league,
          homeTeamId: kambiEvent.event.homeId ?? "",
          homeTeamName: kambiEvent.event.homeName ?? "",
          awayTeamId: kambiEvent.event.awayId ?? "",
          awayTeamName: kambiEvent.event.awayName ?? "",
          startTime: kambiEvent.event.startTime,
          status: "scheduled",
          hasOdds: true,
        });
      }
    }

    return events;
  }

  async scrapeOdds(): Promise<NormalizedOdds[]> {
    const allOdds: NormalizedOdds[] = [];
    const leagueCodes = Object.keys(KAMBI_LEAGUE_MAP).slice(0, 5);

    for (const league of leagueCodes) {
      const url = kambiOperatorUrl(this.operator, KAMBI_LEAGUE_MAP[league]);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;

      const data = (await response.json()) as KambiResponse;
      if (!data.events) continue;

      for (const kambiEvent of data.events) {
        const offers = kambiEvent.betOffers ?? [];
        for (const offer of offers) {
          for (const outcome of offer.outcomes) {
            if (outcome.cancelled || outcome.suspended) continue;
            allOdds.push(normalizeKambiOutcome(outcome, kambiEvent, this.bookId));
          }
        }
      }
    }

    return allOdds;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const url = kambiOperatorUrl(this.operator, KAMBI_LEAGUE_MAP.nfl);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      return {
        ok: response.ok || response.status === 429,
        message: response.status === 429
          ? "Endpoint exists (rate limited — expected)"
          : `HTTP ${response.status}`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "connection failed" };
    }
  }
}

export function createAllKambiScrapers(): KambiScraper[] {
  return Object.keys(KAMBI_OPERATORS).map((op) => new KambiScraper(op as KambiOperatorCode));
}
