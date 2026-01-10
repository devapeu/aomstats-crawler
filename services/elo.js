const PLAYERS = require('../players');
const {
  ELO_SIZE_ADVANTAGE_PER_PLAYER,
  ELO_K_FACTOR,
  ELO_DIVISOR } = require('../config/eloConfig');
const { getPlayerElo, updatePlayerElo } = require('../models/elo');

/**
 * Calculate Elo change using standard formula
 */
function calculateEloChange(ratingA, ratingB, actualScoreA, k = ELO_K_FACTOR) {
  const expectedScoreA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / ELO_DIVISOR));
  return Math.round(k * (actualScoreA - expectedScoreA));
}

/**
 * Update Elo ratings for all players in recent matches
 */
function updateEloForMatches(db, recalculateAll = false) {
  // Get all matches that don't have Elo calculated yet
  // We'll use a flag or check if Elo was updated after match time
  const matches = db.prepare(`
    SELECT DISTINCT match_id, team_match_id, startgametime
    FROM matches
    WHERE team_match_id IS NOT NULL
    ORDER BY startgametime ASC
  `).all();

  for (const match of matches) {
    const { match_id, team_match_id, startgametime } = match;

    if (!recalculateAll) {
      // Skip if we've already processed this match (check if any player Elo was updated after match)
      const playersInMatch = db.prepare(`
        SELECT DISTINCT profile_id FROM matches WHERE match_id = ?
      `).all(match_id).map(p => p.profile_id);

      const eloUpdatedAfterMatch = db.prepare(`
        SELECT COUNT(*) as count FROM player_elo
        WHERE profile_id IN (${playersInMatch.map(() => '?').join(',')})
        AND last_updated > ?
      `).get([...playersInMatch, startgametime]);

      if (eloUpdatedAfterMatch.count > 0) continue; // Already processed
    }

    // Get teams
    const [team1Str, team2Str] = team_match_id.split(' vs ');
    if (!team1Str || !team2Str || team1Str === '' || team2Str === '') {
      console.log(`Skipping corrupted match ${match_id}: ${team_match_id}`);
      continue;
    }
    const team1 = team1Str.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    const team2 = team2Str.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));

    // Ignore matches with players not included in the pool
    if ([...team1, ...team2].some(id => !PLAYERS[id])) continue;

    // Ignore 1v1 games
    if (team1.length === 1 && team2.length === 1) continue;

    // Get average Elo for each team
    const team1Elo = team1.reduce((sum, id) => sum + getPlayerElo(db, id), 0) / team1.length;
    const team2Elo = team2.reduce((sum, id) => sum + getPlayerElo(db, id), 0) / team2.length;

    // Adjust for team size differences in Elo calculation
    const sizeAdvantage = (team1.length - team2.length) * ELO_SIZE_ADVANTAGE_PER_PLAYER;
    const adjustedTeam1Elo = team1Elo + sizeAdvantage;

    // Determine winner (check from one player's perspective)
    const samplePlayer = team1[0];
    const result = db.prepare(`
      SELECT win FROM matches WHERE match_id = ? AND profile_id = ?
    `).get(match_id, samplePlayer);

    if (!result) {
      console.log(`No result for match ${match_id}, player ${samplePlayer}`);
      continue;
    }

    const team1Won = result.win === 1;

    // Calculate Elo changes
    const eloChange = calculateEloChange(adjustedTeam1Elo, team2Elo, team1Won ? 1 : 0);
    const team1Change = eloChange;
    const team2Change = -eloChange;

    // Update each player's Elo
    for (const playerId of team1) {
      const currentElo = getPlayerElo(db, playerId);
      updatePlayerElo(db, playerId, currentElo + team1Change);
    }

    for (const playerId of team2) {
      const currentElo = getPlayerElo(db, playerId);
      updatePlayerElo(db, playerId, currentElo + team2Change);
    }
  }
}

module.exports = {
  getPlayerElo,
  updateEloForMatches
};