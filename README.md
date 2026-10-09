# SportWizzard EV API

Real-time expected value engine powered by [SportWizzard](https://sportwizzard.com) live sportsbook odds, DFS edges, and cross-book arbitrage.

## What it does

- **Ingests** the full SportWizzard live board (342k+ markets, 31 sportsbooks, 26 leagues)
- **Syncs** continuously via the delta feed (`/odds/updated`) at 3-second intervals
- **Computes** no-vig fair prices from cross-book consensus
- **Detects** +EV opportunities where a book's price exceeds fair value
- **Sizes** bets using Kelly Criterion (full and quarter Kelly)
- **Serves** everything as a REST API

## Quick start

```bash
# 1. Get a free API key at https://sportwizzard.com/account (API Keys tab)
# 2. Clone and install
git clone https://github.com/WrapAI/sportwizzard-ev-api.git
cd sportwizzard-ev-api
npm install

# 3. Configure
cp .env.example .env
# Edit .env — add your SPORTWIZZARD_API_KEY

# 4. Run
npm run dev
```

## API endpoints

### Health
```
GET /health
```

### EV Opportunities
```
GET /api/v1/opportunities?min_ev=2.0&league=nfl&limit=50
GET /api/v1/summary
GET /api/v1/best?limit=10
```

### Odds
```
GET /api/v1/odds?league=nfl&market=PLAYER_TOTAL&limit=100
GET /api/v1/odds/history/:oddsId
```

### Signals
```
GET /api/v1/signals/edges?min_edge=3.0
GET /api/v1/signals/arbitrage?min_profit=1.0
GET /api/v1/signals/events?league=nfl
```

## How EV is computed

1. **Consensus fair price**: For each market/selection/line, average implied probabilities across all books quoting it
2. **Vig removal**: For two-sided markets (O/U, HOME/AWAY), remove the vig to get the true no-vig probability
3. **EV calculation**: For each individual book's price, compute `EV% = (fairProb × (decimalOdds - 1) - (1 - fairProb)) × 100`
4. **Kelly sizing**: `Kelly = (fairProb × (decimalOdds - 1) - (1 - fairProb)) / (decimalOdds - 1)`

## Architecture

```
┌──────────────────────────────────────────────┐
│ Sync Layer                                    │
│  ├── Bootstrap: events, edges, arbitrage     │
│  └── Delta: /odds/updated every 3s          │
├──────────────────────────────────────────────┤
│ Store (SQLite, WAL mode)                     │
│  ├── events, odds, players, teams            │
│  ├── edges, arbitrage (pre-computed)         │
│  └── price_history (every price change)      │
├──────────────────────────────────────────────┤
│ EV Engine                                     │
│  ├── Consensus fair pricing (cross-book)     │
│  ├── No-vig probability (two-sided markets)  │
│  ├── EV% calculation per book                │
│  └── Kelly Criterion sizing                  │
├──────────────────────────────────────────────┤
│ REST API (Express)                           │
│  └── /api/v1/opportunities, /odds, /signals  │
└──────────────────────────────────────────────┘
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `SPORTWIZZARD_API_KEY` | — | Required. Free at sportwizzard.com/account |
| `SYNC_INTERVAL_MS` | `3000` | Delta poll interval |
| `SNAPSHOT_ON_START` | `true` | Pull reference data on startup |
| `PORT` | `3400` | API server port |
| `DB_PATH` | `./ev-engine.db` | SQLite database path |
| `MIN_EV_PERCENT` | `1.0` | Default minimum EV% for opportunities |
| `MIN_EDGE_PERCENT` | `0.5` | Default minimum DFS edge% |

## License

MIT
