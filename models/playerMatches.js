const Database = require('better-sqlite3');
const db = new Database('./db.sqlite');

const PlayerMatchesRepo = (db) => ({
  insertMany(rows) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO player_matches (
        match_id,
        profile_id,
        god,
        win,
        team
      )
      VALUES (
        @match_id,
        @profile_id,
        @god,
        @win,
        @team
      )
    `);

    const tx = db.transaction((rows) => {
      for (const row of rows) {
        stmt.run(row);
      }
    });

    tx(rows);
  },
  getMatchCount(profileId, god) {
    let query = `
        SELECT COUNT(*) as count
        FROM player_matches
        WHERE profile_id = ?
    `;

    const params = [profileId];

    if (god !== null) {
      query += ` AND god = ?`;
      params.push(god);
    }

    const row = db.prepare(query).get(...params);

    return row.count ?? 0;
  },
  getPlayerWins(teamMatchId, profileId, {
    scope = 'global'
  }) {
    let matchupIdCondition = "";

    if (scope === 'god') {
      matchupIdCondition = "AND m.team_god_match_id = ?"
    } else if (scope === 'civ') {
      matchupIdCondition = "AND m.team_civ_match_id = ?"
    } else {
      matchupIdCondition = "AND m.team_match_id = ?"
    }

    return db.prepare(`
        SELECT pm.win
        FROM player_matches pm
                 JOIN matches m ON m.match_id = pm.match_id
        WHERE pm.profile_id = ? ${matchupIdCondition}
    `).all(profileId, teamMatchId);
  },
  getPlayerRelationshipWins(profileId, {
    type = 'rival',
    players = null,
    after = 0,
  } = {}) {

    const teamCondition =
      type === 'rival'
        ? 'pm.team != pm2.team'
        : 'pm.team = pm2.team';

    let playerFilterCondition = '';
    let params = [profileId, after];

    if (Array.isArray(players) && players.length > 0) {
      const placeholders = players.map(() => '?').join(',');
      playerFilterCondition = `AND pm2.profile_id IN (${placeholders})`;
      params = [profileId, after, ...players];
    }

    return db.prepare(`
        SELECT pm2.profile_id,
               SUM(pm.win) AS wins,
               COUNT(*)    AS total
        FROM player_matches pm
                 JOIN player_matches pm2
                      ON pm.match_id = pm2.match_id
                 JOIN matches m
                      ON m.match_id = pm.match_id
        WHERE pm.profile_id = ?
          AND ${teamCondition}
          AND pm.profile_id != pm2.profile_id
          AND m.startgametime > ? ${playerFilterCondition}
        GROUP BY pm2.profile_id
    `).all(...params);
  },
  getPlayerWinsByMap(profileId, {gods = null, after = 0}) {
    let params = [profileId, after];

    let godFilterCondition = '';

    if (Array.isArray(gods) && gods.length > 0) {
      const placeholders = gods.map(() => '?').join(',');
      godFilterCondition = `AND pm.god IN (${placeholders})`;
      params = params.concat(gods);
    }

    return db.prepare(`
        SELECT m.mapname,
               SUM(pm.win) AS wins,
               COUNT(*)    AS total
        FROM player_matches pm
                 JOIN matches m ON m.match_id = pm.match_id
        WHERE pm.profile_id = ?
          AND m.startgametime > ?
            ${godFilterCondition}
        GROUP BY m.mapname
        ORDER BY total DESC
    `).all(...params);
  },
  getPlayerWinsByGod(profileId, {after = 0}) {
    return db.prepare(`
      SELECT 
        god,
        COUNT(*) AS total_games,
        ROUND(
          COUNT(CASE WHEN win = 1 THEN 1 END) * 100.0 / COUNT(*),
            2
        ) AS winrate_percent
      FROM player_matches pm
         JOIN matches m ON m.match_id = pm.match_id
      WHERE profile_id = ? AND m.startgametime > ?
      GROUP BY god
      ORDER BY total_games DESC
    `).all(profileId, after);
  },
  getPlayerWinstreak(profileId) {
    const rows = db.prepare(`
        SELECT win
        FROM player_matches
        WHERE profile_id = ?
        ORDER BY match_id DESC
    `).all(profileId);

    let streak = 0;
    for (const r of rows) {
      if (r.win === 1) streak++;
      else break;
    }

    return streak;
  },
  getManyMatchesWithPlayers(after = 0) {
    return db.prepare(`
        SELECT pm.match_id,
               m.startgametime,

               json_group_array(
                       CASE
                           WHEN pm.team = 0 THEN json_object(
                                   'profile_id', pm.profile_id,
                                   'god', pm.god,
                                   'win', pm.win)
                           END
               ) AS team_a,

               json_group_array(
                       CASE
                           WHEN pm.team = 1 THEN json_object(
                                   'profile_id', pm.profile_id,
                                   'god', pm.god,
                                   'win', pm.win)
                           END
               ) AS team_b
        FROM player_matches pm
                 JOIN matches m
                      ON m.match_id = pm.match_id
        WHERE m.startgametime > ?
        GROUP BY pm.match_id,
                 m.startgametime;
    `).all(after);
  },
});

module.exports = {
  PlayerMatchesRepo,
};