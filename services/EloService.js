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
      let scopeKey = null;
      if (scopeType === "god") scopeKey = player.god;
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
  ) {
    for (const player of team) {
      let scopeKey = null;
      if (scopeType === "god") scopeKey = player.god;

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

  updateMatchElo(
    match,
    scopeType = SCOPE.GLOBAL,
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
      );

    const team2Elo =
      this.getAverageElo(
        team2,
        scopeType,
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
    );

    this.updateTeamElo(
      team2,
      -eloChange,
      scopeType,
    );
  },

  updateEloForMatches({
      scopeType = SCOPE.GLOBAL,
    } = {}) {

    const lastProcessedMatch = EloRepo.getLastProcessedMatch(scopeType);

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