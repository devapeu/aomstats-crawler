const PlayersRepo = (db) => ({
  getAll() {
    return db.prepare(
      'SELECT profile_id, name FROM players'
    ).all();
  },
  insertMany(rows) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO players (
        profile_id,
        name
      )
      VALUES (
        @profile_id,
        @name
      )
    `);

    const tx = db.transaction((rows) => {
      for (const row of rows) {
        stmt.run(row);
      }
    });

    tx(rows);
  },
});

module.exports = {
  PlayersRepo
};