const PLAYERS = require('./players');
const { 
  ELO_DEFAULT, 
  ELO_SIZE_ADVANTAGE_PER_PLAYER, 
  ELO_K_FACTOR, 
  WIN_PROB_SIZE_MULTIPLIER_BASE, 
  ELO_DIVISOR } = require('./config/eloConfig');

const insertMatches = (db, matches) => {
  const insertMatch = db.prepare(`
    INSERT OR IGNORE INTO matches (match_id, profile_id, description, startgametime, win, god, mapname, raw_data, team_match_id)
    VALUES (@match_id, @profile_id, @description, @startgametime, @win, @god, @mapname, @raw_data, @team_match_id)
  `);

  const insertMany = db.transaction((matches) => {
    for (const m of matches) {
      if ( m.description === "AUTOMATCH" || m.resulttype === 4 || m.duration < 300 ) { 
        continue 
      }

      insertMatch.run({
        match_id: m.match_id,
        profile_id: m.profile_id,
        description: m.description,
        startgametime: m.startgametime,
        win: m.win ? 1 : 0,
        god: m.god,
        mapname: m.mapname,
        raw_data: JSON.stringify(m),
        team_match_id: null,
      });
    }
  });

  insertMany(matches);
};

const computeAndUpdateTeamMatchIds = (db) => {
  const matchIds = db.prepare('SELECT DISTINCT match_id FROM matches').all();

  const updateStmt = db.prepare('UPDATE matches SET team_match_id = ? WHERE match_id = ?');

  for (const { match_id } of matchIds) {
    const players = db.prepare('SELECT profile_id, raw_data FROM matches WHERE match_id = ?').all(match_id);

    // Parse player data (raw_data contains full player info)
    const playerObjs = players.map(p => JSON.parse(p.raw_data));

    // Group players by team (assuming 'team' field in player object)
    const team1 = playerObjs.filter(p => p.team === 0).map(p => p.profile_id).sort();
    const team2 = playerObjs.filter(p => p.team === 1).map(p => p.profile_id).sort();

    // Sort teams lex order to be order-agnostic
    const sortedTeams = [team1, team2].sort((a,b) => a.join(',').localeCompare(b.join(',')));
    const teamMatchId = sortedTeams.map(t => t.join(',')).join(' vs ');

    updateStmt.run(teamMatchId, match_id);
  }
}

const crawlPlayerMatches = async (profileId, beforeLimit) => {
  const allMatches = [];
  let before = Math.floor(Date.now() / 1000); // start now

  while (true) {
    const url = `https://aomstats.io/api/profile/${profileId}/matches?leaderboard=0&before=${before}`;
    const res = await fetch(url);
    const matches = await res.json();

    if (!matches.length) break;

    allMatches.push(...matches);

    const earliest = Math.min(...matches.map(m => m.startgametime));
    if (!earliest) break;

    if (beforeLimit) {
      const latest = Math.max(...matches.map(m => m.startgametime));
      if (beforeLimit > latest) break;
    }
    
    before = earliest - 1; // step back
    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}

function getStats(db, players, type, getProfileId) {
  return (req, res) => {
    const profileId = getProfileId(req);
    const after = req.query.after ?? 0;

    const rows = db.prepare(`
      SELECT match_id, team_match_id, win
      FROM matches
      WHERE profile_id = ? AND startgametime > ?
    `).all(profileId, after);

    if (!rows.length) {
      return res.json({ message: 'Unable to fetch data for this player' });
    }

    const stats = {};
    let total = 0;

    rows.forEach(row => {
      const [team1, team2] = row.team_match_id
        .split(" vs ")
        .map(t => t.split(","));

      const isTeam1 = team1.includes(profileId);
      const playerTeam = isTeam1 ? team1 : team2;
      const otherTeam  = isTeam1 ? team2 : team1;
      const targetTeam = type === 'partners' ? playerTeam : otherTeam;

      if (!targetTeam) return;
      total++;

      const filtered = type === 'partners'
        ? targetTeam.filter(p => p !== profileId)
        : targetTeam;

      filtered.forEach(id => {
        if (!players.includes(id)) return;

        if (!stats[id]) stats[id] = { wins: 0, total: 0 };
        stats[id].total++;

        const won =
          (type === 'partners' && row.win === 1) ||
          (type === 'rivals' && row.win === 0);

        if (won) stats[id].wins++;
      });
    });

    res.json({ players: stats, total });
  };
}

// Async wrapper for getStats to use with await
function getStatsAsync(db, players, type, profileId) {
  return new Promise((resolve, reject) => {
    const req = {
      params: { profile_id: profileId },
      query: {}
    };
    const res = {
      json: (data) => resolve(data)
    };
    getStats(db, players, type, () => profileId)(req, res);
  });
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
 * Get current Elo rating for a player, defaulting to 1500 if not found
 */
function getPlayerElo(db, profileId) {
  const stmt = db.prepare('SELECT elo FROM player_elo WHERE profile_id = ?');
  const result = stmt.get(profileId);
  return result ? result.elo : ELO_DEFAULT;
}

/**
 * Update Elo rating for a player
 */
function updatePlayerElo(db, profileId, newElo) {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO player_elo (profile_id, elo, last_updated)
    VALUES (?, ?, ?)
  `);
  stmt.run(profileId, newElo, now);
}

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
  insertMatches,
  computeAndUpdateTeamMatchIds,
  crawlPlayerMatches,
  getStats,
  getWins,
  getStatsAsync,
  calculateWinProbability,
  updateEloForMatches,
  getPlayerElo
};
