const PlayersRepo = (db) => ({
  getAll() {
    return db.prepare(
      'SELECT profile_id, name FROM players'
    ).all();
  },
});

module.exports = {
  PlayersRepo
};