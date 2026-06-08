# aomstats-crawler

Lightweight Node.js crawler and API for aomstats.io match data.

This repository crawls match history from aomstats.io for a defined list of player profile IDs, stores matches in a local SQLite database, and exposes several HTTP endpoints to query aggregated stats.

## Overview

The crawler fetches match pages for configured player profile IDs (in `players.js`) and stores them in `db.sqlite`. It computes team identifiers and stores per-player rows so queries can be made from the perspective of a specific player.

The Express server exposes endpoints to get god winrates, partner/rival stats, map stats, ELO ratings, matchup odds, and more.

## Requirements

- Node.js 18+ (fetch API used)
- npm
- SQLite (bundled via `better-sqlite3` dependency)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Ensure `players.js` contains the list of profile IDs you want to crawl.

3. Start the server:

```bash
npm run start
```

4. Run the following script to make an initial fetch into `db.sqlite`:

```bash
node scripts/fetch_latest.js
```

## Endpoints

### Player stats

- **GET /gods/:profile_id?after=\<unix_timestamp\>**
  - Returns god usage and winrate from the perspective of `profile_id` for matches after the optional `after` timestamp.

```json
{
  "gods": [
    { "name": "Zeus", "total_games": 12, "winrate_percent": 66.67 }
  ]
}
```

- **GET /partners/:profile_id?after=\<unix_timestamp\>&god=\<god_name\>**
  - Returns players that appeared on the same team as `profile_id`, with wins and total games together. Optionally filtered by god.

```json
{
  "players": [
    { "profile_id": 12345, "wins": 3, "total": 5 }
  ]
}
```

- **GET /rivals/:profile_id?after=\<unix_timestamp\>&god=\<god_name\>**
  - Returns players that appeared on the opposing team, with wins (from `profile_id`'s perspective) and total games. Optionally filtered by god.

```json
{
  "players": [
    { "profile_id": 67890, "wins": 4, "total": 7 }
  ]
}
```

- **GET /maps/:profile_id?after=\<unix_timestamp\>&god=\<comma_separated_gods\>**
  - Returns map winrates for `profile_id`. The `god` query param accepts one or more comma-separated god names to filter by.

```json
{
  "maps": [
    { "name": "rm_acropolis", "wins": 8, "total_games": 12, "winrate_percent": 66.67 }
  ]
}
```

- **GET /winstreak/:profile_id**
  - Returns the current consecutive win streak for `profile_id`.

```json
{
  "winstreak": 5
}
```

### ELO

- **GET /elo/:profile_id?god=\<god_name\>**
  - Returns the current ELO for `profile_id`. Without `god`, returns the global ELO. With `god`, returns the ELO for that specific god.

```json
{
  "elo": 1523
}
```

- **GET /elos/:profile_id**
  - Returns ELO values for all gods for `profile_id`.

```json
{
  "elos": [
    { "god": "Zeus", "elo": 1523 },
    { "god": "Poseidon", "elo": 1480 }
  ]
}
```

- **GET /elo-history/:profile_id**
  - Returns the full ELO history for `profile_id`, grouped by god. Timestamps are in milliseconds.

```json
{
  "rows": {
    "Zeus": [
      { "startgametime": 1700000000000, "elo": 1510 },
      { "startgametime": 1700100000000, "elo": 1523 }
    ]
  }
}
```

### Matchup

- **POST /matchup**
  - Body: `{ "team1": [{ "profile_id": 123 }], "team2": [{ "profile_id": 456 }] }`
  - Returns head-to-head win counts, win probability for each team, and match history.

```json
{
  "code": 200,
  "data": {
    "teams": {
      "123": { "wins": 7, "probability": 63.5 },
      "456": { "wins": 4, "probability": 36.5 }
    },
    "history": []
  }
}
```

### Global stats

- **GET /stats**
  - Returns top maps by play count, ELO leaderboard for tracked players, and top 2v2+ team matchups.

```json
{
  "maps": [
    { "mapname": "rm_acropolis", "count": 42 }
  ],
  "elo": [
    { "profile_id": 123, "elo": 1600 }
  ],
  "matchups": [
    { "team_match_id": "123,456 vs 789,101", "count": 12, "team1": ["123", "456"], "team2": ["789", "101"] }
  ]
}
```

- **GET /matches.csv**
  - Downloads all matches as a CSV file named `YYYYMMDD_matches.csv`.

### Discord

- **POST /send-planner-to-discord** *(requires `X-Api-Key` header)*
  - Body: `{ "imageBase64": "<base64 PNG>", "message": "optional text" }`
  - Sends an image to the configured Discord webhook.

```json
{ "code": 200, "message": "Image sent to Discord successfully" }
```

## Database schema

The `matches` table is created automatically with the following columns:

- match_id INTEGER
- profile_id INTEGER
- description TEXT
- startgametime INTEGER
- raw_data TEXT
- win INTEGER
- team_match_id TEXT

Primary key is `(match_id, profile_id)`.

## Cron job

A cron job scheduled in `cron.js` runs daily at 09:00 server time (`0 9 * * *`). It fetches recent matches for all players in `players.js`, deduplicates them, inserts new matches into the DB, and computes `team_match_id` values.
