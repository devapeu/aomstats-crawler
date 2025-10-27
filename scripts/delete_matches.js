const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

const stmt = db.prepare(`
    DELETE FROM matches
    WHERE match_id in 
      (SELECT match_id FROM matches
       WHERE json_extract(raw_data, '$.team') = 2
    `);

stmt.run();

console.log('Update complete.');