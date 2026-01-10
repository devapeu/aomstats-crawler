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

module.exports = {
  getStats,
  getStatsAsync,
};