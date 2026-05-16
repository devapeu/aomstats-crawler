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
    return db.prepare(`
      SELECT
        scope_type,
        scope_key,
        elo,
        last_updated
      FROM player_elo
      WHERE profile_id = ?
      ORDER BY scope_type, scope_key
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

  updateLastProcessedMatch(matchId) {
    return db.prepare(`
        INSERT INTO player_elo_meta (meta_key, meta_value)
        VALUES ('last_processed_match', ?)
        ON CONFLICT(meta_key)
            DO UPDATE SET meta_value = excluded.meta_value
    `).run(matchId);
  },
});

module.exports = {
  EloRepo,
  SCOPE,
};