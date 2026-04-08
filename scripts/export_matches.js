const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const PLAYERS = require(path.resolve(__dirname, '..', 'players.js'));

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

// Updated stmt includes profile_id and win
const stmt = db.prepare(`
  SELECT profile_id, win, match_id, team_match_id, startgametime, raw_data
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

  const hasUnknownPlayer = matchRows.some(r => !PLAYERS[r.profile_id]);
  if (hasUnknownPlayer) return;

  let is1v1 = false;
  let timestamp = matchRows[0].startgametime;
  let duration = JSON.parse(matchRows[0].raw_data).duration;

  const winners = matchRows
      .filter(r => r.win === 1)
      .map(r => PLAYERS[r.profile_id]);

  const losers = matchRows
      .filter(r => r.win === 0)
      .map(r => PLAYERS[r.profile_id]);

  if (losers.length === 1 && winners.length === 1) is1v1 = true;

  return `${match_id},${winners.join("-")},${losers.join("-")},${timestamp},${duration},${is1v1}`;
}).filter(Boolean);

const header = "match_id,winners,losers,timestamp,duration,is_1v1";
fs.writeFileSync('matches.csv', [header, ...result].join("\n"), 'utf-8');
