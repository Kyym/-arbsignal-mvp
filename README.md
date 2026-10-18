# ArbSignal MVP

A runnable Node.js + Express + Socket.IO MVP for manually testing football goals Over/Under arbitrage calculations. Includes a responsive installable PWA shell.

## Requirements

- Node.js 18 or newer
- npm
- A browser

## Run locally

```bash
npm install
npm start
```

Open <http://localhost:3000>.

For development with automatic server restarts:

```bash
npm run dev
```

## Try the example

1. Click **Load example odds**.
2. The form fills in simulated odds: Over 2.5 at 1.76 and Under 2.5 at 3.66.
3. Submit **Scan these odds**.
4. The opportunity feed displays the implied probability sum, theoretical profit, and stake allocation.

The sample values are not live odds. The app does not connect to any bookmaker or place bets.

## Calculation

For decimal odds `O` and `U`:

```text
S = 1/O + 1/U
potential arbitrage exists if S < 1
profit percentage = (1/S - 1) * 100
over stake = bankroll * (1/O) / S
under stake = bankroll * (1/U) / S
equalized return = bankroll / S
```

This equalizes the gross returns across the two outcomes before fees, rounding, limits, odds movement, voids, and settlement differences. A result is marked qualified only if it is an arbitrage and meets the configured minimum profit threshold.

## API

- `GET /api/state` — current settings and last 50 opportunities
- `PUT /api/settings` — update `minProfitPct` and `bankroll`
- `POST /api/scan` — validate and calculate a manual entry
- `DELETE /api/opportunities/:id` — remove one entry
- `DELETE /api/opportunities` — clear feed
- Socket.IO event `state:update` — pushes settings and feed updates to connected browsers

Example request:

```json
{
  "fixture": "Example Match",
  "market": "goals_over_under",
  "line": 2.5,
  "overBookmaker": "Bookmaker A",
  "overOdds": 1.76,
  "underBookmaker": "Bookmaker B",
  "underOdds": 3.66,
  "source": "manual"
}
```

## PWA notes

- The app includes a web manifest, SVG icon, and service worker.
- Install prompts generally require HTTPS, except localhost. Deploy behind HTTPS for installability.
- The offline cache provides the app shell, but scanning and Socket.IO updates require the server to be reachable.

## Before adding a live odds feed

1. Use a licensed/authorized odds API and keep API keys on the server in environment variables.
2. Match fixture, market, goals line, and settlement rules exactly before comparing prices.
3. Track source timestamps and stale odds.
4. Re-check odds immediately before displaying an alert; a mathematical edge does not guarantee bets can be placed at those prices.
5. Add provider-specific rate limits, retries, and data validation.

## Important limitations

This MVP uses in-memory storage: restarting the server clears settings and scan history. It is for testing and education, not a betting recommendation. No odds are fetched live, no wagers are placed, and theoretical profit is not guaranteed in practice.
