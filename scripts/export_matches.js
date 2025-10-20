const playerMap = {
  '1074827715': "Ayax",
  '1074199836': "Diego",
  '1076671413': "Diego",
  '1073862520': "Piero",
  '1074875183': "Jair",
  '1074196830': "Jaume",
  '1074910820': "Sebastián",
  '1075027222': "Renato",
  '1074849746': "Héctor",
  '1074203172': "Jardani",
  '1074839111': "Christian",
  '1075268390': "Almeyda"
};

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

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
    .map(r => playerMap[r.profile_id] ?? r.profile_id);

  const losers = matchRows
    .filter(r => r.win === 0)
    .map(r => playerMap[r.profile_id] ?? r.profile_id);

  return `${match_id},${winners.join("-")},${losers.join("-")}`;
}).filter(Boolean);

const header = "match_id,winners,losers";
fs.writeFileSync('matches.csv', [header, ...result].join("\n"), 'utf-8');
