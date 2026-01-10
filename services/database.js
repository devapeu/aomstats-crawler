const Database = require('better-sqlite3');
const { insertMatches, computeAndUpdateTeamMatchIds, updateEloForMatches, getPlayerElo } = require('../dbHelpers');
const PLAYERS = require('../players');
const { ELO_DEFAULT } = require('./config/eloConfig');

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
    elo REAL DEFAULT ${ELO_DEFAULT}},
    last_updated INTEGER
  )
`);

module.exports = {
  db,
  playerIds,
  insertMatches: (matches) => insertMatches(db, matches),
  computeAndUpdateTeamMatchIds: () => computeAndUpdateTeamMatchIds(db),
  updateEloForMatches: () => updateEloForMatches(db),
  getPlayerElo: (profileId) => getPlayerElo(db, profileId),
};