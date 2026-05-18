const { EloRepo, SCOPE } = require('../models/elo');
const { PlayerMatchesRepo } = require("../models/playerMatches");
const { db } = require("../database");

const Elo = EloRepo(db);
const PlayerMatches = PlayerMatchesRepo(db);

const {
  ELO_BETA_FACTOR,
  ELO_SCALE,
  ELO_K_FACTOR,
  MATCH_COUNT_FACTOR
} = require('../config/eloConfig');

function isValidMatch(team1, team2) {
  const t1Size = team1.length;
  const t2Size = team2.length;

  const bothTeamsExist = t1Size > 0 && t2Size > 0;
  const isOneVsOne = t1Size === 1 && t2Size === 1;
  const sizeDifferenceTooLarge = Math.abs(t1Size - t2Size) >= 2;

  return bothTeamsExist && !isOneVsOne && !sizeDifferenceTooLarge;
}

const EloService = {
  getElo(profileId, scopeType, scopeKey) {
    return Elo.getElo(profileId, scopeType, scopeKey);
  },
  getAllElo(profileId) {
    return Elo.getAllElo(profileId);
  },
  getTeamEloSum(team, scopeType) {
    return team.reduce((sum, player) => {
      let scopeKey = "";
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

  updateTeamElo(team, change, teamSize, scopeType = SCOPE.GLOBAL, match_id) {
    for (const player of team) {
      let scopeKey = "";
      if (scopeType === SCOPE.GOD) {
        scopeKey = player.god;
      }

      const currentElo = Elo.getElo(
        player.profile_id,
        scopeType,
        scopeKey
      );

      const matchCount = PlayerMatches.getMatchCount(
        player.profile_id,
        match_id,
        scopeType === SCOPE.GOD ? scopeKey : null,
        Date.now() - 15 * 24 * 60 * 60
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

      Elo.logEloChange({
        profile_id: player.profile_id,
        match_id,
        scopeType,
        scopeKey,
        oldElo: currentElo,
        newElo,
        delta: playerDelta,
      });
    }
  },

  updateMatchElo(match, scopeType = SCOPE.GLOBAL) {
    const team1 = JSON.parse(match.team_a).filter(Boolean) || [];
    const team2 = JSON.parse(match.team_b).filter(Boolean) || [];

    if (!isValidMatch(team1, team2)) return;

    const team1Size = team1.length;
    const team2Size = team2.length;

    const change = this.calculateChange(team1, team2, scopeType)

    const team1Won = team1[0]?.win === 1;

    const result1 = team1Won ? 1 : 0;
    const result2 = 1 - result1;

    const deltaTeam1 =
      ELO_K_FACTOR * (result1 - change);
    const deltaTeam2 =
      ELO_K_FACTOR * (result2 - (1 - change));

    this.updateTeamElo(team1, deltaTeam1, team1Size, scopeType, match.match_id);
    this.updateTeamElo(team2, deltaTeam2, team2Size, scopeType, match.match_id);
  },

  updateEloForMatches({
      scopeType = SCOPE.GLOBAL,
    } = {}) {

    const lastProcessedMatch = Elo.getLastProcessedMatch(scopeType);

    const matches = PlayerMatches.getManyMatchesWithPlayers(lastProcessedMatch);

    for (const match of matches) {
      this.updateMatchElo(
        match,
        scopeType,
      );
      Elo.updateLastProcessedMatch(match.match_id, scopeType);
    }
  },
  calculateChange(team1, team2, scope = SCOPE.GLOBAL) {
    const team1Elo = EloService.getTeamEloSum(
      team1.map(p => ({ profile_id: p.profile_id, key: scope === 'god' ? p.god : "" })), scope);
    const team2Elo = EloService.getTeamEloSum(
      team2.map(p => ({ profile_id: p.profile_id, key: scope === 'god' ? p.god : "" })), scope);

    const team1Size = team1.length;
    const team2Size = team2.length;

    const adjustedTeam1Elo =
      team1Elo + ELO_BETA_FACTOR * Math.log(team1Size);

    const adjustedTeam2Elo =
      team2Elo + ELO_BETA_FACTOR * Math.log(team2Size);

    return 1 / (1 + Math.pow(10, (adjustedTeam2Elo - adjustedTeam1Elo) / ELO_SCALE));;
  },
  getEloHistory(profileId, scopeType, scopeKey = "") {
    return Elo.getEloHistory(profileId, scopeType, scopeKey);
  }
};

module.exports = {
  EloService,
};