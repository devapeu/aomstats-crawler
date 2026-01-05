const cron = require('node-cron');
const fs = require('fs');
const { crawlPlayerMatches } = require('../dbHelpers');
const { db, playerIds, insertMatches, computeAndUpdateTeamMatchIds, updateEloForMatches } = require('./database');

cron.schedule('0 9 * * *', async () => { // runs at 5 am EST
  try {
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

    insertMatches(allMatches);
    computeAndUpdateTeamMatchIds();
    updateEloForMatches();

    console.log(`Fetched and saved ${allMatches.length} matches`);
  } catch (err) {
    console.error('Error in cron job:', err);
    fs.appendFileSync('cron_errors.log', `[${new Date().toISOString()}] ${err.stack || err}\n`);
  }
});

module.exports = {};