const { EloRepo, SCOPE } = require('../models/elo');
const { PlayerMatchesRepo } = require("../models/playerMatches");
const { db } = require("../database");

const Elo = EloRepo(db);
const PlayerMatches = PlayerMatchesRepo(db);

const { MatchRepo } = require('../models/matches');
const {
  ELO_BETA_FACTOR,
  ELO_SCALE,
  ELO_K_FACTOR,
  MATCH_COUNT_FACTOR
} = require('../config/eloConfig');

function isValidMatch(team1, team2) {
  if (!team1.length || !team2.length) {
    return false;
  }

  // Ignore 1v1
  if (team1.length === 1 && team2.length === 1) {
    return false;
  }

  return true;
}

const matchCountCache = new Map();

function getMatchCountCached(profileId, scopeType, scopeKey = null) {
  const key = `${profileId}:${scopeType}:${scopeKey ?? "global"}`;

  if (matchCountCache.has(key)) {
    return matchCountCache.get(key);
  }

  const count = PlayerMatches.getMatchCount(
    profileId,
    scopeType === SCOPE.GOD ? scopeKey : null
  );

  matchCountCache.set(key, count);

  return count;
}

const EloService = {
  getTeamEloSum(team, scopeType) {
    return team.reduce((sum, player) => {
      let scopeKey = null;
      if (scopeType === SCOPE.GOD) scopeKey = player.god;
      return (
        sum +
        Elo.getElo(
          player.profile_id,
          scopeType,
          scopeKey
        )
      );
    }, 0);
  },

  updateTeamElo(team, change, teamSize, scopeType = SCOPE.GLOBAL) {
    for (const player of team) {
      let scopeKey = null;
      if (scopeType === SCOPE.GOD) {
        scopeKey = player.god;
      }

      const currentElo = Elo.getElo(
        player.profile_id,
        scopeType,
        scopeKey
      );

      const matchCount = getMatchCountCached(
        player.profile_id,
        scopeKey
      );

      const activityFactor =
        matchCount === 0
          ? 1
          : matchCount > MATCH_COUNT_FACTOR
            ? 0.4
            : 0.4 + 0.6 * (
            (MATCH_COUNT_FACTOR - matchCount) /
            MATCH_COUNT_FACTOR
          );

      const teamSizeFactor = 1 / Math.sqrt(teamSize);

      const playerDelta =
        change * teamSizeFactor * activityFactor;

      const newElo = currentElo + playerDelta;

      Elo.upsertElo(
        player.profile_id,
        scopeType,
        scopeKey,
        newElo
      );
    }
  },

  updateMatchElo(match, scopeType = SCOPE.GLOBAL) {
    const team1 = match.team_a || [];
    const team2 = match.team_b || [];

    if (!isValidMatch(team1, team2)) return;

    const team1Elo = this.getTeamEloSum(team1, scopeType);
    const team2Elo = this.getTeamEloSum(team2, scopeType);

    const team1Size = team1.length;
    const team2Size = team2.length;

    const adjustedTeam1Elo =
      team1Elo + ELO_BETA_FACTOR * Math.log(team1Size);

    const adjustedTeam2Elo =
      team2Elo + ELO_BETA_FACTOR * Math.log(team2Size);

    const expectedTeam1 =
      1 / (1 + Math.pow(10, (adjustedTeam2Elo - adjustedTeam1Elo) / ELO_SCALE));

    const team1Won = team1[0]?.win === 1;

    const result1 = team1Won ? 1 : 0;
    const result2 = 1 - result1;

    const deltaTeam1 =
      ELO_K_FACTOR * (result1 - expectedTeam1);
    const deltaTeam2 =
      ELO_K_FACTOR * (result2 - (1 - expectedTeam1));

    this.updateTeamElo(team1, deltaTeam1, team1Size, scopeType);
    this.updateTeamElo(team2, deltaTeam2, team2Size, scopeType);
  },

  updateEloForMatches({
      scopeType = SCOPE.GLOBAL,
    } = {}) {

    matchCountCache.clear();

    const lastProcessedMatch = Elo.getLastProcessedMatch(scopeType);

    const matches = MatchRepo.getManyMatchesWithPlayers({
      after: lastProcessedMatch
    });

    for (const match of matches) {
      this.updateMatchElo(
        match,
        scopeType,
      );
    }
  },
};

module.exports = {
  EloService,
};