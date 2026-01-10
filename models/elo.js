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


module.exports = {
  getPlayerElo,
  updatePlayerElo,
}