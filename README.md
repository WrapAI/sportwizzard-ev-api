# SportWizzard EV API

Real-time expected value engine powered by [SportWizzard](https://sportwizzard.com) live sportsbook odds, DFS pick'em lines, and cross-book arbitrage.

Built on the [SportWizzard API](https://sportwizzard.com/developers) — 342k+ live markets, 31 sportsbooks, 26 leagues.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Sync Layer                                               │
│  ├── Bootstrap: reference, events, edges, arbitrage     │
│  └── Delta: /odds/updated every 3s → SQLite merge       │
├─────────────────────────────────────────────────────────┤
│ Store (SQLite, WAL mode)                                │
│  ├── events, odds, players, teams                       │
│  ├── edges, arbitrage (SportWizzard pre-computed)       │
│  └── price_history (every observed price)               │
├─────────────────────────────────────────────────────────┤
│ EV Engine                                               │
│  ├── Devig: Shin (default), Power, Multiplicative       │
│  ├── Fair pricing: sharp book hierarchy → consensus     │
│  ├── +EV detection: per-book vs sharp fair probability  │
│  ├── DFS edges: payout multiplier vs fair probability   │
│  ├── Kelly Criterion: full and quarter sizing           │
│  └── Arbitrage: best-over/best-under cross-book         │
├─────────────────────────────────────────────────────────┤
│ REST API (Express)                                      │
│  └── /api/v1/opportunities, /dfs-edges, /arbitrage,     │
│      /odds, /signals, /summary, /best                   │
└─────────────────────────────────────────────────────────┘
```

## Devig Methods

Three methods for removing bookmaker margin from over/under pairs:

| Method | Formula | Best for |
|--------|---------|----------|
| **Shin** (default) | Newton's method solving for insider trading proportion z | Sharp books (Pinnacle) — most accurate |
| **Power** | Raises implied probs to power 0.95, normalizes | Soft books — good middle ground |
| **Multiplicative** | Proportional scaling: `p_i / (p_over + p_under)` | Quick estimates, least accurate |

## Fair Price Hierarchy

Fair probabilities are derived from the sharpest available source:

1. **Pinnacle** (sharpest — market-making book)
2. **Novig** (prediction-market style, low margin)
3. **BetOnline** (recreational sharp)
4. **Caesars** (major book with efficient lines)
5. **BetRivers** (Kambi-powered, efficient)
6. **DraftKings** (high-volume major)
7. **FanDuel** (high-volume major)
8. **BetMGM** (high-volume major)

If no sharp book has both sides of a line, falls back to **consensus median** across 3+ books.

## EV Computation

**Positive EV**: For each non-sharp book's price, compute:
```
EV% = (fair_prob × bet_decimal_odds - 1) × 100
```
Fair probability comes from the sharp book hierarchy above. Opportunities surface when a soft book's price exceeds fair value.

**Kelly Criterion**: Optimal bet sizing:
```
Kelly = (fair_prob × (odds - 1) - (1 - fair_prob)) / (odds - 1)
```
Full Kelly is aggressive; quarter Kelly is recommended for variance management.

**DFS Edges**: For pick'em style offers (PrizePicks, Underdog, etc.):
```
Edge% = (fair_prob × payout_multiplier - 1) × 100
```
Payout multiplier defaults to 2.0x (standard single pick); uses `dfsMultiplier` from the API when available.

**Arbitrage**: Find best over + best under across different books:
```
If (1/best_over_odds + 1/best_under_odds) < 1.0 → profit opportunity
```
Stake allocation is proportional to implied probabilities.

## Quick Start

```bash
git clone https://github.com/WrapAI/sportwizzard-ev-api.git
cd sportwizzard-ev-api
npm install

cp .env.example .env
# Add your SPORTWIZZARD_API_KEY (free at sportwizzard.com/account)

npm run dev
```

## API Endpoints

### EV Engine

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| `GET /api/v1/opportunities` | `min_ev`, `league`, `devig`, `limit` | +EV bets sorted by EV% |
| `GET /api/v1/dfs-edges` | `min_edge`, `league`, `devig`, `limit` | DFS pick'em edges |
| `GET /api/v1/arbitrage` | `min_profit`, `league`, `limit` | Cross-book arbitrage |
| `GET /api/v1/summary` | — | Full system summary |
| `GET /api/v1/best` | `limit` | Top EV opportunities |

### Odds

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| `GET /api/v1/odds` | `league`, `market`, `sportsbook`, `event_id`, `player_id`, `limit` | Query stored odds |
| `GET /api/v1/odds/events/:eventId` | — | All odds for one event |
| `GET /api/v1/odds/history/:oddsId` | — | Price history for one market |

### SportWizzard Signals (pre-computed)

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| `GET /api/v1/signals/edges` | `min_edge`, `league` | SportWizzard's own edge calculations |
| `GET /api/v1/signals/arbitrage` | `min_profit`, `league` | SportWizzard's own arb calculations |
| `GET /api/v1/signals/events` | `league`, `status` | Event listing |
| `GET /api/v1/signals/sportsbooks` | — | Sportsbook market counts |

### System

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Uptime, sync stats, delta poller status |

## Query Examples

```bash
# Top +EV bets in NFL (minimum 2% edge, Shin devig)
curl "http://localhost:3400/api/v1/opportunities?min_ev=2.0&league=nfl&devig=shin"

# DFS edges on PrizePicks lines
curl "http://localhost:3400/api/v1/dfs-edges?min_edge=3.0&devig=shin"

# Arbitrage opportunities with 1%+ profit
curl "http://localhost:3400/api/v1/arbitrage?min_profit=1.0"

# All NFL player totals
curl "http://localhost:3400/api/v1/odds?league=nfl&market=PLAYER_TOTAL&limit=500"

# System summary
curl "http://localhost:3400/api/v1/summary"
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `SPORTWIZZARD_API_KEY` | — | Required. Free at sportwizzard.com/account |
| `SYNC_INTERVAL_MS` | `3000` | Delta feed poll interval (ms) |
| `SNAPSHOT_ON_START` | `true` | Bootstrap reference data on startup |
| `PORT` | `3400` | API server port |
| `DB_PATH` | `./ev-engine.db` | SQLite database path |
| `MIN_EV_PERCENT` | `1.0` | Default minimum EV% threshold |
| `MIN_EDGE_PERCENT` | `0.5` | Default minimum DFS edge% threshold |

## Sharp Book Hierarchy

Fair prices derive from the sharpest book with both sides quoted:

```
Pinnacle → Novig → BetOnline → Caesars → BetRivers → DraftKings → FanDuel → BetMGM
```

If no sharp book has the line, falls back to consensus median (3+ books required).

## SportWizzard Data Coverage

- **342k+ live markets** across 31 sportsbooks and 26 leagues
- Player props (O/U, yes/no, milestones), game totals, spreads, moneylines, team totals
- DFS pick'em lines from PrizePicks, Underdog, Sleeper, Dabble, and more
- Historical odds and arbitrage by event
- Box-score stats per game (player, team)

## Project Structure

```
src/
├── client/
│   ├── sportwizzard.ts    # Full API client (28 endpoints)
│   └── types.ts           # TypeScript types for SportWizzard responses
├── sync/
│   ├── bootstrap.ts       # Startup data pulls
│   └── delta.ts           # 3s delta feed poller
├── store/
│   └── db.ts              # SQLite schema + helpers
├── ev/
│   ├── engine.ts          # EV, DFS edges, arbitrage computation
│   ├── math.ts            # Devig methods, Kelly, odds conversion
│   └── books.ts           # Book classification (sharp/DFS/sportsbook)
├── api/routes/
│   ├── ev.ts              # /opportunities, /dfs-edges, /arbitrage, /summary
│   ├── odds.ts            # /odds, /odds/history, /odds/events
│   └── signals.ts         # /signals/* (SportWizzard pre-computed)
├── config.ts              # Environment config
└── index.ts               # Express entry point
```

## License

MIT
