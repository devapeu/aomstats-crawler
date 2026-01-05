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
 * Calculate the win probability for team1 vs team2 using log-odds.
 * @param {Object} db - Database connection
 * @param {string[]} team1 - Array of player IDs for team 1
 * @param {string[]} team2 - Array of player IDs for team 2
 * @returns {Promise<number>} - Probability (0-1) that team1 beats team2
 */
async function calculateWinProbability(db,team1, team2) {
  // Helper to get winrate for a player vs a rival
  async function getWinrate(player, rival) {

    const stats = await getStatsAsync(db, [rival], 'rivals', player);
    const rivalStats = stats.players?.[rival];
    if (!rivalStats || rivalStats.total === 0) return 0.5; // default to 50%
    return rivalStats.wins / rivalStats.total;
  }

  // Step 1: For each player in team1, get their winrate vs each player in team2
  let logits = [];
  for (const p1 of team1) {
    for (const p2 of team2) {
      const winrate = await getWinrate(p1, p2);
      // Convert to logit (log-odds)
      const logit = Math.log(winrate / (1 - winrate));
      logits.push(logit);
    }
  }

  // Step 2: Aggregate team advantage (average logit)
  const teamAdvantage = logits.reduce((a, b) => a + b, 0) / logits.length;

  // Step 3: Convert back to win probability
  const probability = 1 / (1 + Math.exp(-teamAdvantage));
  return probability;
}


/**
 * Fetch the amount of wins and losses in a given matchup
 * @param {Object} db 
 * @param {string[]} team1 
 * @param {string[]} team2 
 * @returns {number[]}
 */
async function getScore(db, team1, team2) {
  const team1Key = team1.join(',');
  const team2Key = team2.join(',');
  const teamMatchId = `${team1Key} vs ${team2Key}`;
  
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

module.exports = { 
  insertMatches,
  computeAndUpdateTeamMatchIds,
  crawlPlayerMatches,
  getStats,
  getScore,
  getStatsAsync,
  calculateWinProbability
};
