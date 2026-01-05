const Database = require('better-sqlite3');
const { insertMatches, computeAndUpdateTeamMatchIds } = require('../dbHelpers');
const PLAYERS = require('../players');

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

module.exports = {
  db,
  playerIds,
  insertMatches: (matches) => insertMatches(db, matches),
  computeAndUpdateTeamMatchIds: () => computeAndUpdateTeamMatchIds(db),
};