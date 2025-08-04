const Database = require('better-sqlite3');
const fetch = require('node-fetch');

const { insertMatches, computeAndUpdateTeamMatchIds } = require('./dbHelpers');
const PLAYERS = require('./players');

const db = new Database('./db.sqlite');

async function crawlPlayerMatches(profileId) {
  const allMatches = [];
  let before = Math.floor(Date.now() / 1000);

  while (true) {
    const url = `https://aomstats.io/api/profile/${profileId}/matches?leaderboard=0&before=${before}`;
    const res = await fetch(url);
    const matches = await res.json();

    if (!matches.length) break;

    allMatches.push(...matches);
    const earliest = Math.min(...matches.map(m => m.startgametime));
    if (!earliest) break;
    before = earliest - 1;

    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}

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
