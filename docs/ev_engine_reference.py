"""
SmartStake +EV Engine
Computes positive EV, DFS comparisons, and arbitrage from raw odds feed.
Replaces the subscription-gated /api/positive-ev and /api/fantasy endpoints.
"""

import json
import time
import math
from typing import Any, Optional
from smartstake_direct import create_client, SmartStakeDirect


class EVEngine:
    """Computes fair probability, EV, and DFS edges from raw odds."""

    SHARP_BOOKS = ["pinnacle", "circa", "betfair", "4cx", "sporttrade", "novig"]
    DFS_BOOKS = [
        "prizepicks_best", "underdog_dfs_best", "boomfantasy",
        "parlayplay", "chalkboard", "sleeper", "dabble_best", "betr_best"
    ]

    def __init__(self, client: SmartStakeDirect):
        self.client = client

    @staticmethod
    def decimal_to_american(dec: float) -> int:
        if dec >= 2.0:
            return int(round((dec - 1) * 100))
        return int(round(-100 / (dec - 1)))

    @staticmethod
    def american_to_decimal(amer: int) -> float:
        if amer > 0:
            return 1 + amer / 100
        return 1 + 100 / abs(amer)

    @staticmethod
    def implied_probability(dec: float) -> float:
        return 1.0 / dec

    @staticmethod
    def multiplicative_devig(over_dec: float, under_dec: float) -> tuple[float, float]:
        """Remove vig proportionally."""
        p_over = 1.0 / over_dec
        p_under = 1.0 / under_dec
        total = p_over + p_under
        return p_over / total, p_under / total

    @staticmethod
    def power_devig(over_dec: float, under_dec: float, power: float = 0.95) -> tuple[float, float]:
        """Power method devig."""
        p_over = (1.0 / over_dec) ** power
        p_under = (1.0 / under_dec) ** power
        total = p_over + p_under
        return p_over / total, p_under / total

    @staticmethod
    def shin_devig(over_dec: float, under_dec: float) -> tuple[float, float]:
        """Shin method — best for sharp books. Iteratively solve for z (insider trading proportion)."""
        p_over = 1.0 / over_dec
        p_under = 1.0 / under_dec
        booksum = p_over + p_under

        if abs(booksum - 1.0) < 0.0001:
            return p_over, p_under

        # Newton's method to find z
        z = 0.01
        for _ in range(50):
            pi_over = (p_over * (1 - z)) / booksum
            pi_under = (p_under * (1 - z)) / booksum
            # Shin equation: sum of adjusted probs should equal 1
            f = (p_over * (1 - z) + z * p_over * booksum) / booksum + \
                (p_under * (1 - z) + z * p_under * booksum) / booksum - 1.0
            df = (-p_over / booksum + p_over * booksum / booksum - 
                  p_under / booksum + p_under * booksum / booksum)
            if abs(df) < 1e-12:
                break
            z_new = z - f / df
            if abs(z_new - z) < 1e-10:
                z = z_new
                break
            z = max(0.0, min(0.2, z_new))

        fair_over = (p_over * (1 - z)) / booksum
        fair_under = (p_under * (1 - z)) / booksum
        return fair_over, fair_under

    def compute_fair_odds(self, odds: list[dict]) -> dict[str, dict]:
        """
        For each selection (lineKey + side), compute fair probability from sharp books.
        Returns: {selection_key: {fair_prob, fair_dec, fair_amer, source_book}}
        """
        # Group odds by lineKey
        lines: dict[str, list[dict]] = {}
        for o in odds:
            lk = o.get("lineKey", "")
            if lk:
                lines.setdefault(lk, []).append(o)

        fair_odds = {}
        for line_key, line_odds in lines.items():
            # Find over/under pairs from sharp books
            overs = {}
            unders = {}
            for o in line_odds:
                book = o.get("bookmaker", "").lower()
                dec = o.get("odds") or 0
                side = o.get("selectionLine", "")
                if dec > 1.0:
                    if side == "over":
                        overs[book] = dec
                    elif side == "under":
                        unders[book] = dec

            # Find best sharp book pair
            best_sharp = None
            for sharp in self.SHARP_BOOKS:
                if sharp in overs and sharp in unders:
                    best_sharp = sharp
                    break

            if best_sharp:
                over_dec = overs[best_sharp]
                under_dec = unders[best_sharp]
                fair_over, fair_under = self.shin_devig(over_dec, under_dec)

                for o in line_odds:
                    side = o.get("selectionLine", "")
                    if side == "over":
                        fair_odds[f"{line_key}~over"] = {
                            "fair_prob": fair_over,
                            "fair_dec": 1.0 / fair_over if fair_over > 0 else 0,
                            "fair_amer": self.decimal_to_american(1.0 / fair_over) if fair_over > 0 else 0,
                            "source_book": best_sharp,
                            "over_dec": over_dec,
                            "under_dec": under_dec,
                        }
                    elif side == "under":
                        fair_odds[f"{line_key}~under"] = {
                            "fair_prob": fair_under,
                            "fair_dec": 1.0 / fair_under if fair_under > 0 else 0,
                            "fair_amer": self.decimal_to_american(1.0 / fair_under) if fair_under > 0 else 0,
                            "source_book": best_sharp,
                            "over_dec": over_dec,
                            "under_dec": under_dec,
                        }

        return fair_odds

    def find_positive_ev(self, odds: list[dict], min_ev_pct: float = 1.0) -> list[dict]:
        """
        Find +EV bets: compare each book's odds against fair probability from sharp books.
        This replicates /api/positive-ev without the subscription.
        """
        fair_odds = self.compute_fair_odds(odds)
        edges = []

        for o in odds:
            line_key = o.get("lineKey", "")
            side = o.get("selectionLine", "")
            selection_key = f"{line_key}~{side}"
            book = o.get("bookmaker", "").lower()

            if selection_key not in fair_odds:
                continue
            if book in self.SHARP_BOOKS:
                continue  # Skip sharp books as targets

            fair = fair_odds[selection_key]
            fair_prob = fair["fair_prob"]
            bet_dec = o.get("odds") or 0
            if bet_dec <= 1.0 or fair_prob <= 0 or fair_prob >= 1:
                continue

            # EV = (fair_prob * bet_dec) - 1
            ev = (fair_prob * bet_dec) - 1.0
            ev_pct = ev * 100

            if ev_pct >= min_ev_pct:
                # Kelly criterion
                kelly = max(0, (fair_prob * bet_dec - 1) / (bet_dec - 1))
                edges.append({
                    "player": o.get("playerName", ""),
                    "event": f"{o.get('awayCompetitor', '')} @ {o.get('homeCompetitor', '')}",
                    "market": line_key.split("~")[2] if "~" in line_key else "",
                    "line": o.get("selectionPoints"),
                    "side": side,
                    "book": book,
                    "odds_decimal": bet_dec,
                    "odds_american": self.decimal_to_american(bet_dec),
                    "fair_prob": round(fair_prob, 5),
                    "fair_decimal": round(1.0 / fair_prob, 3),
                    "fair_american": self.decimal_to_american(1.0 / fair_prob),
                    "ev_pct": round(ev_pct, 2),
                    "kelly": round(kelly, 4),
                    "source_book": fair["source_book"],
                    "url": o.get("url", ""),
                })

        edges.sort(key=lambda x: x["ev_pct"], reverse=True)
        return edges

    def find_dfs_edges(self, odds: list[dict], min_edge: float = 0.01) -> list[dict]:
        """
        Compare DFS lines (PrizePicks, Underdog, etc.) against book fair probability.
        This replicates /api/fantasy without the subscription.
        """
        fair_odds = self.compute_fair_odds(odds)
        dfs_plays = []

        for o in odds:
            book = o.get("bookmaker", "").lower()
            if book not in [b.lower() for b in self.DFS_BOOKS]:
                continue

            line_key = o.get("lineKey", "")
            side = o.get("selectionLine", "")
            selection_key = f"{line_key}~{side}"

            if selection_key not in fair_odds:
                continue

            fair = fair_odds[selection_key]
            fair_prob = fair["fair_prob"]

            # DFS payout structure (typically 2x for over/under)
            dfs_payout = 2.0  # standard DFS payout for single pick

            ev = (fair_prob * dfs_payout) - 1.0
            if ev >= min_edge:
                dfs_plays.append({
                    "player": o.get("playerName", ""),
                    "event": f"{o.get('awayCompetitor', '')} @ {o.get('homeCompetitor', '')}",
                    "market": line_key.split("~")[2] if "~" in line_key else "",
                    "line": o.get("selectionPoints"),
                    "side": side,
                    "dfs_book": book,
                    "fair_prob": round(fair_prob, 5),
                    "fair_american": self.decimal_to_american(1.0 / fair_prob),
                    "payout": dfs_payout,
                    "edge_pct": round(ev * 100, 2),
                    "source_book": fair["source_book"],
                })

        dfs_plays.sort(key=lambda x: x["edge_pct"], reverse=True)
        return dfs_plays

    def find_arbitrage(self, odds: list[dict]) -> list[dict]:
        """Find arbitrage opportunities across books."""
        lines: dict[str, dict[str, dict]] = {}
        for o in odds:
            lk = o.get("lineKey", "")
            side = o.get("selectionLine", "")
            book = o.get("bookmaker", "").lower()
            dec = o.get("odds") or 0
            if lk and side and dec > 1.0:
                lines.setdefault(lk, {}).setdefault(side, {})[book] = dec

        arbs = []
        for line_key, sides in lines.items():
            if "over" not in sides or "under" not in sides:
                continue
            best_over = max(sides["over"].items(), key=lambda x: x[1])
            best_under = max(sides["under"].items(), key=lambda x: x[1])

            if best_over[0] == best_under[0]:
                continue

            p_over = 1.0 / best_over[1]
            p_under = 1.0 / best_under[1]
            total = p_over + p_under

            if total < 1.0:
                profit = (1.0 - total) * 100
                stake_over = p_over / total
                stake_under = p_under / total
                arbs.append({
                    "line": line_key,
                    "over_book": best_over[0],
                    "over_odds": best_over[1],
                    "under_book": best_under[0],
                    "under_odds": best_under[1],
                    "profit_pct": round(profit, 2),
                    "stake_over_pct": round(stake_over * 100, 1),
                    "stake_under_pct": round(stake_under * 100, 1),
                })

        arbs.sort(key=lambda x: x["profit_pct"], reverse=True)
        return arbs


if __name__ == "__main__":
    client = create_client()
    engine = EVEngine(client)

    # Get NFL events and odds
    events = client.get_events("nfl", limit=5)
    if not events:
        print("No events")
        exit(1)

    print(f"NFL Events: {len(events)}")
    all_odds = []
    for event in events[:3]:
        odds = client.get_odds(event["matchKey"], limit=2000)
        all_odds.extend(odds)
        print(f"  {event['name']}: {len(odds)} odds entries")

    print(f"\nTotal odds entries: {len(all_odds)}")

    # Find +EV (replaces /api/positive-ev)
    print("\n" + "=" * 80)
    print("POSITIVE EV BETS (computed from sharp book fair probability)")
    print("=" * 80)
    edges = engine.find_positive_ev(all_odds, min_ev_pct=2.0)
    for e in edges[:10]:
        print(f"  {e['player']:25} | {e['side']:5} {e['line']} | {e['book']:15} | "
              f"odds {e['odds_american']:+5} | fair {e['fair_american']:+5} | "
              f"EV {e['ev_pct']:5.1f}% | Kelly {e['kelly']:.3f}")

    # Find DFS edges (replaces /api/fantasy)
    print("\n" + "=" * 80)
    print("DFS PLAYS (vs sharp book fair probability)")
    print("=" * 80)
    dfs = engine.find_dfs_edges(all_odds, min_edge=0.02)
    for d in dfs[:10]:
        print(f"  {d['player']:25} | {d['side']:5} {d['line']} | {d['dfs_book']:20} | "
              f"fair {d['fair_american']:+5} | edge {d['edge_pct']:5.1f}%")

    # Find arbs
    print("\n" + "=" * 80)
    print("ARBITRAGE")
    print("=" * 80)
    arbs = engine.find_arbitrage(all_odds)
    for a in arbs[:5]:
        print(f"  {a['over_book']:15} over {a['over_odds']} vs "
              f"{a['under_book']:15} under {a['under_odds']} | "
              f"profit {a['profit_pct']}%")