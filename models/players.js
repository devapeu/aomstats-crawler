const Database = require('better-sqlite3');
const db = new Database('./db.sqlite');

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