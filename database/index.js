const Database = require('better-sqlite3');
const { insertMatches, computeAndUpdateTeamMatchIds } = require('../models/matches');
const { updateEloForMatches, getPlayerElo } = require('../services/elo');
const PLAYERS = require('../players');
const { ELO_DEFAULT } = require('../config/eloConfig');

// Open or create DB
const db = new Database('./db.sqlite');

// Use player IDs (keys) to perform loops
const playerIds = Object.keys(PLAYERS);

// Create table (adjust columns as needed)
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    match_id INTEGER,
    profile_id INTEGER,
    description TEXT,
    startgametime INTEGER,
    raw_data TEXT,
    win INTEGER,
    team_match_id TEXT,
    PRIMARY KEY(match_id, profile_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_elo (
    profile_id INTEGER PRIMARY KEY,
    elo REAL DEFAULT ${ELO_DEFAULT},
    last_updated INTEGER
  )
`);

db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    tournament_id INTEGER PRIMARY KEY,
    name TEXT,
    is_open INTEGER
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tournament_matches (
    tournament_id INTEGER,
    match_id INTEGER,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
    PRIMARY KEY (tournament_id, match_id)
  )
`)

module.exports = {
  db,
  playerIds,
  insertMatches: (matches) => insertMatches(db, matches),
  computeAndUpdateTeamMatchIds: () => computeAndUpdateTeamMatchIds(db),
  updateEloForMatches: () => updateEloForMatches(db),
  getPlayerElo: (profileId) => getPlayerElo(db, profileId),
};