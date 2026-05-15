const {EloRepo, SCOPE} = require('../models/elo');
const {MatchRepo} = require('../models/matches');

const {
  ELO_SIZE_ADVANTAGE_PER_PLAYER,
} = require('../config/eloConfig');

const {
  calculateEloChange,
} = require('../utils/elo');

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

const EloService = {
  getAverageElo(team, scopeType, scopeKey) {
    const total = team.reduce((sum, player) => {
      return (
        sum +
        EloRepo.getElo(
          player.profile_id,
          scopeType,
          scopeKey
        )
      );
    }, 0);

    return total / team.length;
  },

  updateTeamElo(
    team,
    change,
    scopeType,
    scopeKey
  ) {
    for (const player of team) {
      const currentElo =
        EloRepo.getElo(
          player.profile_id,
          scopeType,
          scopeKey
        );

      EloRepo.upsertElo(
        player.profile_id,
        scopeType,
        scopeKey,
        currentElo + change
      );
    }
  },

  hasProcessedMatch(matchId, startGameTime) {
    return EloRepo.hasProcessedMatch(
      matchId,
      startGameTime
    );
  },

  updateMatchElo(
    match,
    scopeType = SCOPE.GLOBAL,
    scopeKey = null
  ) {
    const team1 = match.team_a || [];
    const team2 = match.team_b || [];

    if (!isValidMatch(team1, team2)) {
      return;
    }

    const team1Elo =
      this.getAverageElo(
        team1,
        scopeType,
        scopeKey
      );

    const team2Elo =
      this.getAverageElo(
        team2,
        scopeType,
        scopeKey
      );

    const sizeAdvantage =
      (team1.length - team2.length) *
      ELO_SIZE_ADVANTAGE_PER_PLAYER;

    const adjustedTeam1Elo =
      team1Elo + sizeAdvantage;

    const team1Won =
      team1[0]?.win === 1;

    const eloChange =
      calculateEloChange(
        adjustedTeam1Elo,
        team2Elo,
        team1Won ? 1 : 0
      );

    this.updateTeamElo(
      team1,
      eloChange,
      scopeType,
      scopeKey
    );

    this.updateTeamElo(
      team2,
      -eloChange,
      scopeType,
      scopeKey
    );
  },

  updateEloForMatches({
      recalculateAll = false,
      scopeType = SCOPE.GLOBAL,
      scopeKeyResolver = null,
    } = {}) {

    const matches = MatchRepo.getManyMatchesWithPlayers();

    for (const match of matches) {
      if (
        !recalculateAll &&
        this.hasProcessedMatch(
          match.match_id,
          match.startgametime
        )
      ) {
        continue;
      }

      const scopeKey =
        scopeKeyResolver
          ? scopeKeyResolver(match)
          : null;

      this.updateMatchElo(
        match,
        scopeType,
        scopeKey
      );
    }
  },
};

module.exports = {
  EloService,
};