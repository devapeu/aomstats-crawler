const Database = require('better-sqlite3');
const db = new Database('./db.sqlite');
const { GOD_TO_PANTHEON, PANTHEON_TO_GODS } = require("../utils/pantheonLookup");

const {ELO_DEFAULT} = require("../config/eloConfig");

const EloRepo = (db) => ({
  getPlayerElo(profile_id, god) {
    const stmt = db.prepare('SELECT elo FROM player_elo WHERE profile_id = ? AND god = ?');
    const result = stmt.get(profile_id, god);
    return result ? result.elo : ELO_DEFAULT;
  },
  getPlayersElo(profileId, gods) {
    let whereClause = '';
    let params = [profileId];

    if (gods.length) {
      const placeholders = gods.map(() => '?').join(',');

      whereClause = `AND WHERE god IN (${placeholders})`;
      params = [profileId, ...gods];
    }

    return db.prepare(`
        SELECT profile_id, elo
        FROM player_elo
        WHERE profile_id = ?;
                 ${whereClause};
    `).all(params);
  },
  updatePlayerElo(profile_id, god, elo) {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
        INSERT OR
        REPLACE INTO player_elo (profile_id, god, elo, last_updated)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run(profile_id, god, elo, now)
  }
});

module.exports = {
  EloRepo,
}