const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

require('../database');

db.exec(`DELETE FROM player_elo_meta`);

db.exec(`
    INSERT INTO player_elo_meta
        (meta_key, meta_value, scope)
    VALUES ('last_processed_match', 0, 'global'),
           ('last_processed_match', 0, 'god')
`);

db.exec(`DELETE FROM player_elo`);
db.exec(`DELETE FROM player_elo_history`);