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

async function crawlPlayerMatches(profileId) {
  const allMatches = [];
  const limit = 60;

  for (let start = 0; ; start += limit) {
    const url = `https://aoe2.net/api/player/matches?game=aoe2de&profile_id=${profileId}&count=${limit}&start=${start}`;
    const res = await axios.get(url);
    const matches = res.data;

    if (!matches.length) break;
    allMatches.push(...matches);
    if (matches.length < limit) break;
    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}
