const MatchesRepo = (db) => ({
  insertMany(rows) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO matches (
        match_id,
        description,
        startgametime,
        mapname,
        duration,
        team_match_id,
        team_god_match_id
      )
      VALUES (
        @match_id,
        @description,
        @startgametime,
        @mapname,
        @duration,
        @team_match_id,
        @team_god_match_id
      )
    `);

    const tx = db.transaction((rows) => {
      for (const row of rows) {
        stmt.run({
          team_match_id: null,
          team_god_match_id: null,
          ...row,
        });
      }
    });

    tx(rows);
  },
  getTopMaps(limit = 10) {
    return db.prepare(`
      SELECT
        COUNT(DISTINCT match_id) AS count,
        mapname
      FROM matches
      WHERE mapname LIKE 'rm_%'
      GROUP BY mapname
      ORDER BY count DESC
      LIMIT ?
    `).all(limit);
  },
  getTopMatchups(limit = 20) {
    return db.prepare(`
      SELECT
        COUNT(DISTINCT match_id) AS count,
        team_match_id
      FROM matches
      GROUP BY team_match_id
      ORDER BY count DESC
      LIMIT ?
    `).all(limit);
  },
});

module.exports = {
  MatchesRepo,
};