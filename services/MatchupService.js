const {
  WIN_PROB_SIZE_MULTIPLIER_BASE,
} = require('../config/eloConfig');

const { EloRepo } = require('../models/elo');
const { PlayerMatchesRepo } = require("../models/playerMatches");
const { db } = require("../database");

const Elo = EloRepo(db);
const PlayerMatches = PlayerMatchesRepo(db);

const { buildMatchupIdFromTeams } = require('../utils/buildMatchupId');
const { EloService } = require("./EloService");

const MatchupService = {
  getMatchupScore(team1, team2) {
    const teamsIncludeGods = team1.every(p => "god" in p) && team2.every(p => "god" in p);

    const scope =
      teamsIncludeGods
        ? 'god'
        : 'global';

    const team_match_id = buildMatchupIdFromTeams(team1, team2, scope);
    const profile_id = team1[0].profile_id;

    const matchHistory = PlayerMatches.getPlayerWins(team_match_id, profile_id, {
      scope: scope
    });

    let team1Wins = 0;
    let team2Wins = 0;

    const history = matchHistory.map(match => {
      const team1Won = match.target_player_win === 1;
      const players = JSON.parse(match.players);

      if (team1Won) {
        team1Wins++;
      } else {
        team2Wins++;
      }

      return {
        match_id: match.match_id,
        mapname: match.mapname,
        startgametime: match.startgametime,
        winners: players.filter(p => p.win === 1),
        losers: players.filter(p => p.win === 0),
      };
    });

    return {
      score: [team1Wins, team2Wins],
      history,
    };
  },
  getMatchupOdds(team1, team2, scope = 'global') {
    const eloProbability = EloService.calculateChange(team1, team2, scope);

    // Method 2: Historical win rate-based probability
    let historicalLogits = [];
    let hasHistoricalData = false;

    for (const p1 of team1) {
      for (const p2 of team2) {
        const stats = PlayerMatches.getPlayerRelationshipWins(p1.profile_id, {
          type: "rivals",
          players: [p2.profile_id]
        });
        const rivalStats = stats.players?.[p2.profile_id];
        if (rivalStats && rivalStats.total > 0) {
          const winrate = rivalStats.wins / rivalStats.total;
          if (winrate > 0 && winrate < 1) { // Avoid log(0) issues
            const logit = Math.log(winrate / (1 - winrate));
            historicalLogits.push(logit);
            hasHistoricalData = true;
          }
        }
      }
    }

    let historicalProbability = 0.5; // default
    if (hasHistoricalData && historicalLogits.length > 0) {
      const teamAdvantage = historicalLogits.reduce((a, b) => a + b, 0) / historicalLogits.length;
      historicalProbability = 1 / (1 + Math.exp(-teamAdvantage));

      // Adjust historical probability for team size differences
      const sizeMultiplier = Math.pow(WIN_PROB_SIZE_MULTIPLIER_BASE, team1Size - team2Size); // 20% advantage per extra player
      historicalProbability = Math.min(0.95, Math.max(0.05, historicalProbability * sizeMultiplier));
    }

    // Combine both methods: weight Elo more heavily when historical data is limited
    const historicalWeight = Math.min(historicalLogits.length / 10, 0.5); // Max 50% weight for historical data
    const eloWeight = 1 - historicalWeight;

    return (eloProbability * eloWeight) + (historicalProbability * historicalWeight);
  }
}

module.exports = {
  MatchupService,
};