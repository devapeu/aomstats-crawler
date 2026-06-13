const path = require('path');
const Database = require('better-sqlite3');

// get database object
const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

// get match from node command
// i.e. node scripts/delete_match.js 123456789
const match_id = process.argv[2];

if (!match_id) {
  console.error("Usage: node delete_match.js <match_id>");
  process.exit(1);
}

const tx = db.transaction((match_id) => {
  db.prepare(`DELETE FROM player_matches WHERE match_id = ?`).run(match_id);
  db.prepare(`DELETE FROM player_elo_history WHERE match_id = ?`).run(match_id);
  db.prepare(`DELETE FROM main.tournament_matches WHERE match_id = ?`).run(match_id);
  db.prepare(`DELETE FROM matches WHERE match_id = ?`).run(match_id);
});

tx(match_id);

console.log(`Deleted match ${match_id} successfully.`);