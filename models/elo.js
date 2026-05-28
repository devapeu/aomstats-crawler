const { ELO_DEFAULT } = require("../config/eloConfig");

const SCOPE = {
  GLOBAL: "global",
  GOD: "god",
  CIV: "civ",
};

const EloRepo = (db) => ({
  getElo(profileId, scopeType = SCOPE.GLOBAL, scopeKey = null) {
    const result = db.prepare(`
      SELECT elo
      FROM player_elo
      WHERE profile_id = ?
        AND scope_type = ?
        AND (
          (scope_key IS NULL AND ? IS NULL)
          OR scope_key = ?
        )
    `).get(profileId, scopeType, scopeKey, scopeKey);

    return result ? result.elo : ELO_DEFAULT;
  },

  getAllElo(profileId) {
    // returns elo values with more than 15 games
    return db.prepare(`
        SELECT
            pe.scope_type,
            pe.scope_key,
            pe.elo,
            pe.last_updated
        FROM player_elo pe
        WHERE pe.profile_id = ?
          AND EXISTS (
            SELECT 1
            FROM player_elo_history peh
            WHERE peh.profile_id = pe.profile_id AND pe.scope_key = peh.scope_key
            GROUP BY peh.profile_id
            HAVING COUNT(*) > 15
        )
        ORDER BY pe.elo DESC, pe.scope_type, pe.scope_key;
    `).all(profileId);
  },

  getGodElo(profileId, god) {
    return this.getElo(profileId, SCOPE.GOD, god);
  },

  getGlobalElo(profileId) {
    return this.getElo(profileId, SCOPE.GLOBAL, null);
  },

  getManyElo(entries, scopeType) {
    if (!entries.length) return [];

    const placeholders = entries
      .map(() => "(?, ?)")
      .join(", ");

    const values = entries.flatMap(entry => [
      entry.profile_id,
      entry.key,
    ]);

    return db.prepare(`
    SELECT
      profile_id,
      scope_key,
      elo
    FROM player_elo
    WHERE scope_type = ?
      AND (profile_id, scope_key) IN (${placeholders})
  `).all(scopeType, ...values);
  },

  upsertElo(profileId, scopeType, scopeKey, elo) {
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO player_elo (
        profile_id,
        scope_type,
        scope_key,
        elo,
        last_updated
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, scope_type, scope_key)
      DO UPDATE SET
        elo = excluded.elo,
        last_updated = excluded.last_updated
    `).run(
      profileId,
      scopeType,
      scopeKey,
      elo,
      now
    );
  },

  updateGodElo(profileId, god, elo) {
    this.upsertElo(profileId, SCOPE.GOD, god, elo);
  },

  updateGlobalElo(profileId, elo) {
    this.upsertElo(profileId, SCOPE.GLOBAL, null, elo);
  },

  getLastProcessedMatch(scopeType = SCOPE.GLOBAL) {
    const row = db.prepare(`
        SELECT meta_value FROM player_elo_meta WHERE meta_key = 'last_processed_match' AND scope = ?
    `).get(scopeType);

    return row?.meta_value ?? null;
  },

  updateLastProcessedMatch(matchId, scope = SCOPE.GLOBAL) {
    return db.prepare(`
        INSERT INTO player_elo_meta (meta_key, meta_value, scope)
        VALUES ('last_processed_match', ?, ?)
        ON CONFLICT(meta_key, scope)
            DO UPDATE SET meta_value = excluded.meta_value
    `).run(matchId, scope);
  },

  logEloChange({
                 profile_id,
                 match_id,
                 scopeType,
                 scopeKey = "",
                 oldElo,
                 newElo,
                 delta,
               }) {
    return db.prepare(`
    INSERT OR IGNORE INTO player_elo_history (
      profile_id,
      match_id,
      scope_type,
      scope_key,
      old_elo,
      new_elo,
      delta
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
      profile_id,
      match_id,
      scopeType,
      scopeKey,
      oldElo,
      newElo,
      delta
    );
  },

  getEloHistory(profile_id, scopeType, scopeKey = "") {
    return db.prepare(`
    SELECT *
    FROM player_elo_history
    WHERE profile_id = ?
      AND scope_type = ?
      AND scope_key = ?
    ORDER BY match_id ASC
  `).all(profile_id, scopeType, scopeKey);
  }

});

module.exports = {
  EloRepo,
  SCOPE,
};