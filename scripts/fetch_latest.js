const { crawlPlayerMatches } = require('../services/aomstats');

const { MatchService } = require("../services/MatchService");
const { EloService } = require("../services/EloService");
const { PlayerService } = require("../services/PlayerService");

(async () => {
  const seen = new Set();
  const allMatches = [];

  const playerIds = PlayerService.getAllPlayersIds();
  const latestMatchDate = MatchService.getLatestDate();

  for (const p of playerIds) {
    const matches = await crawlPlayerMatches(p, latestMatchDate);
    for (const m of matches) {
      const key = `${m.match_id}-${m.profile_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        allMatches.push(m);
      }
    }
  }

  MatchService.storeMatches(allMatches);
  EloService.updateEloForMatches();

  console.log(`Fetched and saved ${allMatches.length} matches`);
})();
