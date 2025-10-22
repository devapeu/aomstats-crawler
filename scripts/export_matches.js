const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const PLAYERS = require(path.resolve(__dirname, '..', 'players.js'));

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

// Updated stmt includes profile_id and win
const stmt = db.prepare(`
  SELECT profile_id, win, match_id, team_match_id 
  FROM matches 
  ORDER BY match_id
`);

const rows = stmt.all();

// Group rows by match_id
const matchesMap = {};
rows.forEach(row => {
  if (!matchesMap[row.match_id]) matchesMap[row.match_id] = [];
  matchesMap[row.match_id].push(row);
});

const result = Object.entries(matchesMap).map(([match_id, matchRows]) => {
  // skip corrupted team_match_id
  if (!matchRows[0].team_match_id || matchRows[0].team_match_id[0] === " " || matchRows[0].team_match_id.slice(-1) === " ") return;

  // Sort players into winners and losers based on win column
  const winners = matchRows
    .filter(r => r.win === 1)
    .map(r => PLAYERS[r.profile_id] ?? r.profile_id);

  const losers = matchRows
    .filter(r => r.win === 0)
    .map(r => PLAYERS[r.profile_id] ?? r.profile_id);

  return `${match_id},${winners.join("-")},${losers.join("-")}`;
}).filter(Boolean);

const header = "match_id,winners,losers";
fs.writeFileSync('matches.csv', [header, ...result].join("\n"), 'utf-8');
