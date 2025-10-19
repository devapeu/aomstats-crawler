// updateMatches.js
const Database = require('better-sqlite3');

// adjust the path to where your DB is inside the container
const db = new Database('../db.sqlite');

// Update rows from JSON

const stmt = db.prepare(`
    DELETE FROM matches
    WHERE json_extract(raw_data, '$.resulttype') = 4
       OR json_extract(raw_data, '$.duration') < 300
  `);

stmt.run();

console.log('Update complete.');
