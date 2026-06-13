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
});

module.exports = {
  MatchesRepo,
};