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

function getStats(db, type) {
  return (req, res) => {
    const after = req.query.after ?? 0;
    const rows = db.prepare(`
      SELECT match_id, team_match_id, win
      FROM matches
      WHERE profile_id = ? AND startgametime > ?
    `).all(req.params.profile_id, after);

    if (!rows.length) {
      return res.json({ message: 'Unable to fetch data for this player' });
    }

    const stats = {}; // { partnerId/rivalId: { wins, total } }
    let total = 0;

    rows.forEach(row => {
      const [team1, team2] = row.team_match_id.split(" vs ").map(t => t.split(","));
      const isTeam1 = team1.includes(req.params.profile_id);
      const playerTeam = isTeam1 ? team1 : team2;
      const otherTeam  = isTeam1 ? team2 : team1;
      const targetTeam = type === 'partners' ? playerTeam : otherTeam;

      if (!targetTeam) return;
      total++;

      // Remove self if partner stats
      const filtered = type === 'partners'
        ? targetTeam.filter(p => p !== req.params.profile_id)
        : targetTeam;

      filtered.forEach(id => {
        if (!PLAYERS.includes(id)) return;
        if (!stats[id]) stats[id] = { wins: 0, total: 0 };
        stats[id].total++;

        // For partners: count win if row.win === 1
        // For rivals: count win if row.win === 0 (i.e. they lost)
        const won = (type === 'partners' && row.win === 1) ||
                    (type === 'rivals' && row.win === 0);
        if (won) stats[id].wins++;
      });
    });

    res.json({ players: stats, total });
  };
}

module.exports = { insertMatches, computeAndUpdateTeamMatchIds, crawlPlayerMatches, getStats };
