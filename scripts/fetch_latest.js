const { crawlPlayerMatches } = require('../services/aomstats');

const { MatchService } = require("../services/MatchService");
const { EloService } = require("../services/EloService");
const { PlayerService } = require("../services/PlayerService");

(async () => {
  const seen = new Set();
  const allMatches = [];

  const playerIds = PlayerService.getAllPlayersIds();
  const latestMatchDate = MatchService.getLatestDate();

  console.log(`Starting to fetch matches starting at ${new Date(latestMatchDate * 1000)}`);

  for (const p of playerIds) {
    console.log(`Fetching games for Player ID: ${p}`);
    const matches = await crawlPlayerMatches(p, latestMatchDate);
    for (const m of matches) {
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
})();
