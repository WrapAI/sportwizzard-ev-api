export interface SwEnvelope<T> {
  success: boolean;
  data: T[];
  nextCursor: string | null;
  meta: {
    count: number;
    updated: string;
  };
}

export interface SwOddsRow {
  id: string;
  eventId: string;
  sportsbook: string;
  market: string;
  selection: string;
  side: string | null;
  teamSide: string | null;
  teamName: string | null;
  line: number | null;
  priceAmerican: string | null;
  priceDecimal: number | null;
  priceProbability: number | null;
  dfsMultiplier: number | null;
  playerId: string | null;
  playerName: string | null;
  suspended: boolean;
  eventStartTime: string;
  updated: string;
  isMain: boolean;
}

export interface SwEvent {
  id: string;
  league: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  startTime: string;
  status: string;
  seasonYear: number;
  hasOdds: boolean;
}

export interface SwPlayer {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  league: string;
  position: string | null;
}

export interface SwTeam {
  id: string;
  name: string;
  league: string;
  abbreviation: string | null;
}

export interface SwEdge {
  id: string;
  eventId: string;
  playerId: string | null;
  playerName: string | null;
  league: string;
  market: string;
  selection: string;
  line: number | null;
  dfsSource: string;
  dfsMultiplier: number;
  sportsbook: string;
  priceAmerican: string;
  priceDecimal: number;
  fairDecimal: number;
  edgePercent: number;
  updated: string;
}

export interface SwArbitrage {
  id: string;
  eventId: string;
  league: string;
  market: string;
  selection1: string;
  selection2: string;
  book1: string;
  book2: string;
  price1Decimal: number;
  price2Decimal: number;
  profitPercent: number;
  stake1Percent: number;
  stake2Percent: number;
  updated: string;
}

export interface SwPlayerStat {
  playerId: string;
  playerName: string;
  teamId: string;
  eventId: string;
  league: string;
  statLine: string;
  statValue: number;
  units: string | null;
}

export interface SwSnapshot {
  markets: number;
  sportsbooks: number;
  buildHash: string;
  pulledAt: string;
}
