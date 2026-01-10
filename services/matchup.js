const {
  ELO_SIZE_ADVANTAGE_PER_PLAYER,
  WIN_PROB_SIZE_MULTIPLIER_BASE,
  ELO_DIVISOR } = require('../config/eloConfig');

const { getPlayerElo } = require('../services/elo');
const { getStatsAsync } = require('../controllers/players');

/**
 * Fetch the amount of wins and losses in a given matchup
 * @param {Object} db
 * @param {string[]} team1
 * @param {string[]} team2
 * @returns {number[]}
 */
async function getWins(db, team1, team2) {
  const sortedTeams = [team1, team2].sort((a, b) => a.join(',').localeCompare(b.join(',')))
  const teamMatchId = sortedTeams.map(t => t.join(',')).join(' vs ');

  const perspectivePlayerId = team1[0];

  const rows = db.prepare(`
    SELECT win FROM matches
    WHERE team_match_id = ? AND profile_id = ?
  `).all(teamMatchId, perspectivePlayerId);

  let team1Wins = 0;
  let team2Wins = 0;

  for (const { win } of rows) {
    if (win === 1) team1Wins++;
    else team2Wins++;
  }

  return [team1Wins, team2Wins];
}

/**
 * Calculate the win probability for team1 vs team2 using both Elo ratings and historical data.
 * Accounts for uneven team sizes by adjusting Elo ratings.
 * @param {Object} db - Database connection
 * @param {string[]} team1 - Array of player IDs for team 1
 * @param {string[]} team2 - Array of player IDs for team 2
 * @returns {Promise<number>} - Probability (0-1) that team1 beats team2
 */
async function calculateWinProbability(db, team1, team2) {
  const team1Size = team1.length;
  const team2Size = team2.length;

  // Method 1: Elo-based probability with team size adjustment
  const team1Elo = team1.reduce((sum, id) => sum + getPlayerElo(db, id), 0) / team1Size;
  const team2Elo = team2.reduce((sum, id) => sum + getPlayerElo(db, id), 0) / team2Size;

  // Adjust for team size differences - each extra player provides ~250 Elo advantage
  const sizeAdvantage = (team1Size - team2Size) * ELO_SIZE_ADVANTAGE_PER_PLAYER;
  const adjustedTeam1Elo = team1Elo + sizeAdvantage;

  const eloProbability = 1 / (1 + Math.pow(10, (team2Elo - adjustedTeam1Elo) / ELO_DIVISOR));

  // Method 2: Historical win rate-based probability
  let historicalLogits = [];
  let hasHistoricalData = false;

  for (const p1 of team1) {
    for (const p2 of team2) {
      const stats = await getStatsAsync(db, [p2], 'rivals', p1);
      const rivalStats = stats.players?.[p2];
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

  const combinedProbability = (eloProbability * eloWeight) + (historicalProbability * historicalWeight);

  return combinedProbability;
}

module.exports = {
  getWins,
  calculateWinProbability
};