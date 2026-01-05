const path = require('path');
const Database = require('better-sqlite3');
const { updateEloForMatches } = require('../dbHelpers');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

// Reset all Elo to 1500 first
db.prepare('UPDATE player_elo SET elo = 1500, last_updated = 0').run();

(async () => {
  console.log('Recalculating Elo for all matches...');
  updateEloForMatches(db, true); // true for recalculate all
  console.log('Elo recalculation complete.');
})();