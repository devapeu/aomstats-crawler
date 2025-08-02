const express = require('express');
const axios = require('axios');
const fs = require('fs'); // Or use DB write instead
const app = express();
const PORT = 3000;

app.get('/fetch/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const matches = await crawlPlayerMatches(profileId);
  
  // Save to file (or DB)
  fs.writeFileSync(`matches_${profileId}.json`, JSON.stringify(matches, null, 2));
  
  res.send(`Fetched ${matches.length} matches for profile ${profileId}`);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function crawlPlayerMatches(profileId, leaderboard = 0) {
  const allMatches = [];
  //const limit = 60;

  const today = Math.floor(Date.now() / 1000);
  const increment = 259200; // 3 days

  for (let start = today; ; start += increment) {
    const url = `https://aomstats.io/api/profile/${profileId}/matches?leaderboard=${leaderboard}&before=${start}`;
    const res = await axios.get(url);
    const matches = res.data;

    if (!matches.length) break;
    allMatches.push(...matches);
//    if (matches.length < limit) break;
    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}
