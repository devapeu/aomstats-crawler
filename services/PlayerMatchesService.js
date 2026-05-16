const { MatchesRepo } = require('../models/matches');
const { PlayerMatchesRepo } = require("../models/playerMatches");
const { PlayersRepo } = require("../models/players");
const { db } = require("../database");

const Matches = MatchesRepo(db);
const Players = PlayersRepo(db);
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