export interface MarketCategory {
  id: number;
  name: string;
}

export const KAMBI_OPERATORS = {
  riv: "BetRivers",
  pb: "BetPARX",
  bb: "BallyBet",
  wp: "WannaParlay",
  cb: "Chalkboard",
  px: "ProphetX",
  ts: "TheScore",
  bet: "Betway",
  fan: "Fanatics",
} as const;

export type KambiOperatorCode = keyof typeof KAMBI_OPERATORS;

export const KAMBI_BASE = "https://eu-offering-api.kambicdn.com/offering/v2018";

export const KAMBI_LEAGUE_MAP: Record<string, string> = {
  nfl: "493",
  nba: "487",
  mlb: "484",
  nhl: "488",
  cfb: "475",
  cbb: "479",
  epl: "1555",
  laliga: "1584",
  seriea: "1622",
  bundesliga: "1560",
  ligue1: "1570",
  ucl: "1528",
  mls: "1700",
  wnba: "489",
  pga_tour: "5450",
  mma: "2222",
  tennis: "1801",
};

export function kambiOperatorUrl(operator: KambiOperatorCode, leagueId: string): string {
  return `${KAMBI_BASE}/${operator}/list.json?lang=en_US&market=US&categoryGroup=COMBINED&category=${leagueId}&useCoupons=false`;
}

export function kambiOperatorCategoriesUrl(operator: KambiOperatorCode): string {
  return `${KAMBI_BASE}/${operator}/list.json?lang=en_US&market=US`;
}
