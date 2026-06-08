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

All tables are created automatically in `db.sqlite` on first run. Foreign key constraints are enforced via `PRAGMA foreign_keys = ON`.

### `matches`

One row per match. Stores shared match metadata.

| Column | Type | Description |
|---|---|---|
| `match_id` | INTEGER PK | Unique match identifier from aomstats.io |
| `description` | TEXT | Match description string |
| `startgametime` | INTEGER | Unix timestamp (ms) of match start |
| `mapname` | TEXT | Map identifier (e.g. `rm_acropolis`) |
| `duration` | INTEGER | Match duration in seconds |
| `team_match_id` | TEXT | Canonical identifier for the team composition (sorted profile IDs, e.g. `123,456 vs 789,101`) |
| `team_god_match_id` | TEXT | Like `team_match_id` but includes god picks |

### `players`

Registry of tracked players.

| Column | Type | Description |
|---|---|---|
| `profile_id` | INTEGER PK | aomstats.io profile ID |
| `name` | TEXT | Display name |

### `player_matches`

One row per (player, match) pair. Links players to matches and stores per-player outcome.

| Column | Type | Description |
|---|---|---|
| `match_id` | INTEGER PK/FK | References `matches.match_id` |
| `profile_id` | INTEGER PK/FK | References `players.profile_id` |
| `god` | TEXT | God played by this player in this match |
| `win` | INTEGER | `1` if the player won, `0` otherwise |
| `team` | INTEGER | Team slot (used to identify teammates vs opponents) |

### `player_elo`

Current ELO rating for each player, broken down by scope.

| Column | Type | Description |
|---|---|---|
| `profile_id` | INTEGER PK/FK | References `players.profile_id` |
| `scope_type` | TEXT PK | Scope category (e.g. `global`, `god`) |
| `scope_key` | TEXT PK | Scope value (empty string for global, god name for god-scoped) |
| `elo` | REAL | Current ELO rating |
| `last_updated` | INTEGER | Unix timestamp of last update |

### `player_elo_history`

Append-only log of every ELO change, one row per (player, match, scope).

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment row ID |
| `profile_id` | INTEGER | Player |
| `match_id` | INTEGER | Match that triggered the change |
| `scope_type` | TEXT | Scope category |
| `scope_key` | TEXT | Scope value |
| `old_elo` | REAL | ELO before the match |
| `new_elo` | REAL | ELO after the match |
| `delta` | REAL | Change (`new_elo - old_elo`) |
| `created_at` | DATETIME | Row insertion time |

### `player_elo_meta`

Key-value store for ELO computation bookkeeping (e.g. last processed match per scope).

| Column | Type | Description |
|---|---|---|
| `meta_key` | TEXT PK | Key name |
| `meta_value` | TEXT | Value |
| `scope` | TEXT PK | Scope this entry applies to |

### `tournaments`

Registry of tournaments.

| Column | Type | Description |
|---|---|---|
| `tournament_id` | INTEGER PK | Unique tournament ID |
| `name` | TEXT | Tournament name |
| `is_open` | INTEGER | `1` if the tournament is still accepting matches, `0` if closed |

### `tournament_matches`

Many-to-many join between tournaments and matches.

| Column | Type | Description |
|---|---|---|
| `tournament_id` | INTEGER PK/FK | References `tournaments.tournament_id` |
| `match_id` | INTEGER PK | Match belonging to this tournament |

## Cron job

A cron job scheduled in `cron.js` runs daily at 09:00 server time (`0 9 * * *`). It fetches recent matches for all players in `players.js`, deduplicates them, inserts new matches into the DB, and computes `team_match_id` values.
