const { PlayerMatchesRepo } = require("../models/playerMatches");
const { db } = require("../database");

const PlayerMatches = PlayerMatchesRepo(db);

const PlayerMatchesService = {
  getPlayerWinsByGod(profileId, {
    after = 0
  } = {}) {
    return PlayerMatches.getPlayerWinsByGod(
      profileId,
      { after });
  },
  getPlayerWinsByTeammate(profileId, {
    god = null,
    after = 0
  } = {}) {
    return PlayerMatches.getPlayerRelationshipWins(
      profileId,
      {
        type: "partner",
        god,
        after,
      }
    )
  },
  getPlayerWinsVsPlayers(profileId, {
    god = null,
    after = 0
  } = {}) {
    return PlayerMatches.getPlayerRelationshipWins(
      profileId,
      {
        type: "rival",
        god,
        after
      }
    )
  },
  getPlayerWinstreak(profileId) {
    return PlayerMatches.getPlayerWinstreak(profileId);
  }
}

module.exports = {
  PlayerMatchesService,
};