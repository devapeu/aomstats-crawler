const Database = require('better-sqlite3');
//const fetch = require('node-fetch');

const PLAYERS = require('../players');
const playerIds = Object.keys(PLAYERS);

const {
  insertMatches,
  computeAndUpdateTeamMatchIds
} = require('../models/matches');
const { crawlPlayerMatches } = require('../services/aomstats');
const { updateEloForMatches } = require('../services/elo');

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

(async () => {
  const seen = new Set();
  const allMatches = [];

  const stmt = db.prepare(`SELECT MAX(startgametime) as latest FROM matches`);
  const result = stmt.get();
  const latestRecordDate = result.latest;

  for (const p of playerIds) {
    const matches = await crawlPlayerMatches(p, latestRecordDate);
    for (const m of matches) {
      const key = `${m.match_id}-${m.profile_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        allMatches.push(m);
      }
    }
  }

  insertMatches(db, allMatches);
  computeAndUpdateTeamMatchIds(db);
  updateEloForMatches(db);

  console.log(`Fetched and saved ${allMatches.length} matches`);
})();
