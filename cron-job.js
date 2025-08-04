const Database = require('better-sqlite3');
const fetch = require('node-fetch');

const PLAYERS = require('./players');
const { 
  insertMatches, 
  computeAndUpdateTeamMatchIds,
  crawlPlayerMatches
 } = require('./dbHelpers');

const db = new Database('./db.sqlite');

(async () => {
  const seen = new Set();
  const allMatches = [];

  for (const p of PLAYERS) {
    const matches = await crawlPlayerMatches(p);
    for (const m of matches) {
      const key = `${m.match_id}-${m.profile_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        allMatches.push(m);
      }
    }
  }

  insertMatches(allMatches);
  computeAndUpdateTeamMatchIds();

  console.log(`Fetched and saved ${allMatches.length} matches`);
})();
