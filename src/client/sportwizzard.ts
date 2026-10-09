import { config } from "../config.js";
import type {
  SwEnvelope,
  SwOddsRow,
  SwEvent,
  SwPlayer,
  SwTeam,
  SwEdge,
  SwArbitrage,
  SwPlayerStat,
} from "./types.js";

interface FetchOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

interface FetchResult<T> {
  status: number;
  body: SwEnvelope<T> | null;
  etag: string | null;
  headers: Headers;
}

function buildUrl(path: string, params?: FetchOptions["params"]): string {
  const url = new URL(`${config.baseUrl}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function fetchSw<T>(
  path: string,
  options: FetchOptions = {},
): Promise<FetchResult<T>> {
  const url = buildUrl(path, options.params);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (config.apiKey) {
    headers["X-Api-Key"] = config.apiKey;
  }

  if (options.headers?.["If-None-Match"]) {
    headers["If-None-Match"] = options.headers["If-None-Match"];
  }

  const response = await fetch(url, { headers });
  const etag = response.headers.get("etag");

  if (response.status === 304) {
    return { status: 304, body: null, etag, headers: response.headers };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SportWizzard ${path} failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as SwEnvelope<T>;
  return { status: 200, body, etag, headers: response.headers };
}

async function paginate<T>(
  path: string,
  params: FetchOptions["params"] = {},
  maxPages = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const result: FetchResult<T> = await fetchSw<T>(path, {
      params: { ...params, cursor: cursor ?? undefined, limit: 1000 },
    });

    if (!result.body) break;
    all.push(...result.body.data);
    cursor = result.body.nextCursor;
    page++;

    if (!cursor) break;
  }

  return all;
}

export const sw = {
  async status() {
    const r = await fetchSw<{ totalMarkets: number; sportsbooks: number }>("/status");
    return r.body?.data[0] ?? null;
  },

  async leagues(): Promise<string[]> {
    const r = await fetchSw<string>("/leagues");
    return r.body?.data ?? [];
  },

  async sportsbooks(): Promise<{ id: string; marketCount: number }[]> {
    const r = await fetchSw<{ id: string; marketCount: number }>("/sportsbooks");
    return r.body?.data ?? [];
  },

  async markets(): Promise<unknown[]> {
    const r = await fetchSw<unknown>("/markets");
    return r.body?.data ?? [];
  },

  async marketsActive(): Promise<unknown[]> {
    const r = await fetchSw<unknown>("/markets/active");
    return r.body?.data ?? [];
  },

  async events(params?: {
    league?: string;
    team_id?: string;
    status?: string;
    starts_after?: string;
    starts_before?: string;
  }): Promise<SwEvent[]> {
    return paginate<SwEvent>("/events", params);
  },

  async eventsActive(league?: string): Promise<SwEvent[]> {
    return paginate<SwEvent>("/events/active", { league });
  },

  async event(id: string): Promise<SwEvent | null> {
    const r = await fetchSw<SwEvent>(`/events/${id}`);
    return r.body?.data[0] ?? null;
  },

  async eventOdds(
    eventId: string,
    opts?: { odds_format?: string; is_main?: boolean; etag?: string },
  ): Promise<{ rows: SwOddsRow[]; etag: string | null; notModified: boolean }> {
    const r = await fetchSw<SwOddsRow>(`/events/${eventId}/odds`, {
      params: { odds_format: opts?.odds_format ?? "decimal", is_main: opts?.is_main },
      headers: opts?.etag ? { "If-None-Match": opts.etag } : undefined,
    });
    return {
      rows: r.body?.data ?? [],
      etag: r.etag,
      notModified: r.status === 304,
    };
  },

  async odds(params?: {
    league?: string;
    sportsbook?: string;
    market?: string;
    event_id?: string;
    player_id?: string;
    team_id?: string;
    odds_format?: string;
    is_main?: boolean;
  }): Promise<SwOddsRow[]> {
    return paginate<SwOddsRow>("/odds", {
      ...params,
      odds_format: params?.odds_format ?? "decimal",
    });
  },

  async oddsUpdated(
    since: string,
    params?: {
      league?: string;
      sportsbook?: string;
      market?: string;
      odds_format?: string;
    },
  ): Promise<SwOddsRow[]> {
    return paginate<SwOddsRow>("/odds/updated", {
      since,
      ...params,
      odds_format: params?.odds_format ?? "decimal",
    });
  },

  async playerOdds(
    playerId: string,
    opts?: { odds_format?: string; is_main?: boolean },
  ): Promise<SwOddsRow[]> {
    return paginate<SwOddsRow>(`/players/${playerId}/odds`, {
      odds_format: opts?.odds_format ?? "decimal",
      is_main: opts?.is_main,
    });
  },

  async teamOdds(teamId: string, opts?: { odds_format?: string }): Promise<SwOddsRow[]> {
    return paginate<SwOddsRow>(`/teams/${teamId}/odds`, {
      odds_format: opts?.odds_format ?? "decimal",
    });
  },

  async snapshot(etag?: string): Promise<{ etag: string | null; notModified: boolean; size: number }> {
    const url = `${config.baseUrl}/snapshot`;
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["X-Api-Key"] = config.apiKey;
    if (etag) headers["If-None-Match"] = etag;

    const response = await fetch(url, { headers });
    const newEtag = response.headers.get("etag");

    if (response.status === 304) {
      return { etag: newEtag, notModified: true, size: 0 };
    }

    if (!response.ok) {
      throw new Error(`Snapshot failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return { etag: newEtag, notModified: false, size: buffer.byteLength };
  },

  async edges(params?: {
    league?: string;
    source?: string;
    min_edge?: number;
    event_id?: string;
  }): Promise<SwEdge[]> {
    return paginate<SwEdge>("/edges", params);
  },

  async arbitrage(params?: {
    type?: string;
    league?: string;
    event_id?: string;
    min_profit?: number;
  }): Promise<SwArbitrage[]> {
    return paginate<SwArbitrage>("/arbitrage", params);
  },

  async historicalArbitrage(params?: {
    from?: string;
    to?: string;
    min_profit?: number;
  }): Promise<SwArbitrage[]> {
    return paginate<SwArbitrage>("/historical/arbitrage", params);
  },

  async historicalOdds(eventId: string, date?: string): Promise<SwOddsRow[]> {
    return paginate<SwOddsRow>("/historical/odds", { event_id: eventId, date });
  },

  async players(params?: { league?: string; team?: string; team_id?: string }): Promise<SwPlayer[]> {
    return paginate<SwPlayer>("/players", params);
  },

  async player(id: string): Promise<SwPlayer | null> {
    const r = await fetchSw<SwPlayer>(`/players/${id}`);
    return r.body?.data[0] ?? null;
  },

  async playerStats(id: string, season?: string): Promise<unknown[]> {
    return paginate<unknown>(`/players/${id}/stats`, { season });
  },

  async playerStatsBulk(params?: {
    event_id?: string;
    team_id?: string;
    player_id?: string;
  }): Promise<SwPlayerStat[]> {
    return paginate<SwPlayerStat>("/stats/players", params);
  },

  async teams(league?: string): Promise<SwTeam[]> {
    return paginate<SwTeam>("/teams", { league });
  },

  async team(id: string): Promise<SwTeam | null> {
    const r = await fetchSw<SwTeam>(`/teams/${id}`);
    return r.body?.data[0] ?? null;
  },

  async eventStats(eventId: string): Promise<unknown[]> {
    return paginate<unknown>(`/events/${eventId}/stats`);
  },

  async accountUsage(): Promise<unknown[]> {
    const r = await fetchSw<unknown>("/account/usage");
    return r.body?.data ?? [];
  },
};
