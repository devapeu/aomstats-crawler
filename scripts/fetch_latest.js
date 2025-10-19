const Database = require('better-sqlite3');
//const fetch = require('node-fetch');

const PLAYERS = require('../players');
const { 
  insertMatches, 
  computeAndUpdateTeamMatchIds,
  crawlPlayerMatches
 } = require('../dbHelpers');

const db = new Database('../db.sqlite');

(async () => {
  const seen = new Set();
  const allMatches = [];

  const stmt = db.prepare(`SELECT MAX(startgametime) as latest FROM matches`);
  const result = stmt.get();
  const latestRecordDate = result.latest;

  for (const p of PLAYERS) {
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

  console.log(`Fetched and saved ${allMatches.length} matches`);
})();
