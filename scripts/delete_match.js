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

const stmt = db.prepare(`
  DELETE FROM matches
  WHERE match_id = ?
`);

stmt.run(match_id);

console.log(`Deleted match ${match_id} successfully.`);