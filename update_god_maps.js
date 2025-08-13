// updateMatches.js
const Database = require('better-sqlite3');

// adjust the path to where your DB is inside the container
const db = new Database('./db.sqlite');

// Try adding columns, ignore if they already exist
try {
  db.prepare(`ALTER TABLE matches ADD COLUMN god TEXT`).run();
} catch (err) {
  if (!err.message.includes('duplicate column name')) throw err;
}

try {
  db.prepare(`ALTER TABLE matches ADD COLUMN mapname TEXT`).run();
} catch (err) {
  if (!err.message.includes('duplicate column name')) throw err;
}

// Update rows from JSON
const stmt = db.prepare(`
  UPDATE matches
  SET god     = json_extract(raw_data, '$.god'),
      mapname = json_extract(raw_data, '$.mapname')
`);
stmt.run();

console.log('Update complete.');
