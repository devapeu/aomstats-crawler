const path = require('path');
const Database = require('better-sqlite3');
const { updateEloForMatches } = require('../services/elo');
const { ELO_DEFAULT } = require('../config/eloConfig');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

// Reset all Elo to 1500 first
db.prepare(`UPDATE player_elo SET elo = ${ELO_DEFAULT}, last_updated = 0`).run();

(async () => {
  console.log('Recalculating Elo for all matches...');
  updateEloForMatches(db, true); // true for recalculate all
  console.log('Elo recalculation complete.');
})();