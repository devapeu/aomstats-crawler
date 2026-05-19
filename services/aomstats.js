const {PlayerService} = require("./PlayerService");
const {MatchService} = require("./MatchService");
const {EloService} = require("./EloService");

const crawlPlayerMatches = async (profileId, beforeLimit) => {
  const allMatches = [];
  let before = Math.floor(Date.now() / 1000); // start now

  while (true) {
    const url = `https://aomstats.io/api/profile/${profileId}/matches?leaderboard=0&before=${before}`;
    const res = await fetch(url);
    const matches = await res.json()

    console.log(`Fetching ${url}`);

    if (!matches.length) break;

    allMatches.push(...matches);

    const earliest = Math.min(...matches.map(m => m.startgametime));
    if (!earliest) break;

    if (beforeLimit) {
      const latest = Math.max(...matches.map(m => m.startgametime));
      if (beforeLimit > latest) break;
    }

    before = earliest - 1; // step back
    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}

async function crawlFromAPI () {
  const seen = new Set();
  const allMatches = [];

  const playerIds = PlayerService.getAllPlayersIds();
  const latestMatchDate = MatchService.getLatestDate();

  console.log(`Starting to fetch matches starting at ${new Date(latestMatchDate * 1000)}`);

  for (const p of playerIds) {
    console.log(`Fetching games for Player ID: ${p}`);
    const matches = await crawlPlayerMatches(p, latestMatchDate);
    for (const m of matches) {
      if (m.profile_id === 1076671413) { m.profile_id = 1074199836; }
      const key = `${m.match_id}-${m.profile_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        allMatches.push(m);
        console.log(`Added Match No. ${m.match_id} from Player No. ${m.profile_id}`);
      }
    }
  }

  console.log(`Fetch complete. Inserting matches...`);

  MatchService.storeMatches(allMatches);
  EloService.updateEloForMatches();
  EloService.updateEloForMatches({scopeType: "god"});

  console.log(`Fetched and saved ${allMatches.length} matches`);
}

module.exports = {
  crawlPlayerMatches,
  crawlFromAPI,
};