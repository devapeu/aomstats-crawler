# aomstats-crawler

Lightweight Node.js crawler and API for aomstats.io match data.

This repository crawls match history from aomstats.io for a defined list of player profile IDs, stores matches in a local SQLite database, and exposes several HTTP endpoints to query aggregated stats.

## Overview

The crawler fetches match pages for configured player profile IDs (in `players.js`) and stores them in `db.sqlite`. It computes team identifiers and stores per-player rows so queries can be made from the perspective of a specific player.

The small Express server exposes endpoints to get god winrates, partner stats, and team stats.

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

3. Start the server with

```bash
npm run start
```

3. Run the following script 

```bash 
node scripts/fetch_latest.js
``` 

to make an initial fetch into `db.sqlite`.

## Endpoints

- GET /gods/:profile_id?after=<unix_timestamp>
  - Returns god usage and winrate (from the perspective of `profile_id`) for matches after the optional `after` timestamp.
  - Response example:

```json
{
  "gods": [
    { "name": "Zeus", "total_games": 12, "winrate_percent": 66.67 }
  ]
}
```

- GET /partners/:profile_id?after=<unix_timestamp>
  - Returns partners (other players that appeared on the same team) with counts of wins and total matches together.
  - Response example:

```json
{
  "players": {
    "12345": { "wins": 3, "total": 5 },
    "23456": { "wins": 1, "total": 2 }
  },
  "total": 10
}
```

- GET /teams/:team_id
  - `team_id` is expected in the format `"id1,id2 vs id3,id4"`.
  - Returns simplified win counts for the first player on the left team.
  - Response example:

```json
{
  "id1,id2": 7,
  "id3,id4": 3
}
```

- GET /fetch/:profileId
  - Manually fetches matches for a single profile and inserts them.

## Database schema

The `matches` table is created automatically with the following columns:

- match_id INTEGER
- profile_id INTEGER
- description TEXT
- startgametime INTEGER
- raw_data TEXT
- win INTEGER
- team_match_id TEXT

Primary key is (match_id, profile_id).

## Cron job

A cron job scheduled in `app.js` runs daily at 09:00 server time (cron expression `0 9 * * *`). It fetches recent matches for all players in `players.js`, deduplicates them, inserts new matches into the DB, and computes `team_match_id` values.