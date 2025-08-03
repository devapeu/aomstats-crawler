const express = require('express');
const axios = require('axios');
const fs = require('fs'); // Or use DB write instead
const app = express();
const PORT = 3000;

const PLAYERS = [
  '1074827715',
  '1074199836',
  '1073862520',
  '1074875183',
  '1074196830',
  '1074910820',
  '1075027222',
  '1074849746',
  '1074203172',
  '1074839111',
  '1075268390'
]

app.get('/fetch/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const matches = await crawlPlayerMatches(profileId);
  
  // Save to file (or DB)
  fs.writeFileSync(`matches_${profileId}.json`, JSON.stringify(matches, null, 2));
  
  res.send(`Fetched ${matches.length} matches for profile ${profileId}`);
});

app.get('/fetch-all', async(req, res) => {
  const seen = new Set();
  const allMatches = [];

  for (const p of PLAYERS) {
    const playerMatches = await crawlPlayerMatches(p);
    
    for (const match of playerMatches) {
      if (match.description == "AUTOMATCH") continue;
      const key = `${match.match_id}-${match.profile_id}`;
      if (!seen.has(key)){
        seen.add(key);
        allMatches.push(match);
      }
    }
  }

  fs.writeFileSync(`all_matches.json`, JSON.stringify(allMatches, null, 2));
  res.send("Finished fetching all matches! Whew!");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function crawlPlayerMatches(profileId) {
  const allMatches = [];
  let before = Math.floor(Date.now() / 1000); // start now

  while (true) {
    const url = `https://aomstats.io/api/profile/${profileId}/matches?leaderboard=0&before=${before}`;
    const res = await fetch(url);
    const matches = await res.json();

    if (!matches.length) break;

    allMatches.push(...matches);

    const earliest = Math.min(...matches.map(m => m.startgametime));
    if (!earliest) break;

    before = earliest - 1; // step back
    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}
