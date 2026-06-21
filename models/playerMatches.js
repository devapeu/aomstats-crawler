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
  getMatchCount(profileId, start_date, end_date, god) {
    let query = `
        SELECT COUNT(*) as count
        FROM player_matches pm
        JOIN matches m ON m.match_id = pm.match_id
        WHERE pm.profile_id = ?
        AND m.startgametime < ?
    `;

    const params = [profileId, end_date];

    if (god !== null) {
      query += ` AND pm.god = ?`;
      params.push(god);
    }

    if (start_date !== null) {
      query += ` AND m.startgametime > ?`;
      params.push(start_date);
    }

    const row = db.prepare(query).get(...params);

    return row.count ?? 0;
  },
  getPlayerWins(teamMatchId, profileId, { scope = 'global' } = {}) {
    const matchupIdCondition =
      scope === 'god'
        ? "AND m.team_god_match_id = ?"
        : "AND m.team_match_id = ?";

    return db.prepare(`
        SELECT
            pm.match_id,
            m.mapname,
            m.startgametime,
            pm.win AS target_player_win,

            json_group_array(
                    json_object(
                            'profile_id', players.profile_id,
                            'name', p.name,
                            'win', players.win,
                            'god', players.god
                    )
            ) AS players

        FROM player_matches pm
                 JOIN matches m
                      ON m.match_id = pm.match_id
                 JOIN player_matches players
                      ON players.match_id = pm.match_id
                JOIN players p
                      ON players.profile_id = p.profile_id

        WHERE pm.profile_id = ?
            ${matchupIdCondition}

        GROUP BY
            pm.match_id,
            m.mapname,
            m.startgametime,
            pm.win

        ORDER BY m.startgametime DESC
    `).all(profileId, teamMatchId);
  },
  getPlayerRelationshipWins(profileId, {
    type = 'rival',
    players = null,
    god = null,
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

    let godFilterCondition = '';
    if (god !== null) {
      godFilterCondition = `AND pm.god = ?`;
      params.push(god)
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
          AND m.startgametime > ? 
            ${playerFilterCondition}
            ${godFilterCondition}
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
          AND m.mapname LIKE 'rm_%'
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
  getTopUpsets(limit = 10, after = 0) {
    return db.prepare(`
        WITH team_elos AS (
            SELECT
                pm.match_id,
                pm.win,
                COUNT(*)          AS player_count,
                AVG(peh.old_elo)  AS avg_elo,
                json_group_array(json_object(
                    'profile_id', pm.profile_id,
                    'name', p.name,
                    'god', pm.god,
                    'elo', ROUND(peh.old_elo, 0)
                )) AS players
            FROM player_matches pm
            JOIN player_elo_history peh
                ON peh.match_id = pm.match_id
                AND peh.profile_id = pm.profile_id
                AND peh.scope_type = 'god'
            JOIN players p ON p.profile_id = pm.profile_id
            GROUP BY pm.match_id, pm.win
        )
        SELECT
            m.match_id,
            m.startgametime,
            m.mapname,
            m.duration,
            ROUND(w.avg_elo, 0) AS winner_avg_elo,
            ROUND(l.avg_elo, 0) AS loser_avg_elo,
            ROUND(l.avg_elo - w.avg_elo, 0) AS elo_diff,
            w.players AS winners,
            l.players AS losers
        FROM team_elos w
        JOIN team_elos l ON w.match_id = l.match_id AND w.win = 1 AND l.win = 0
        JOIN matches m ON m.match_id = w.match_id
        WHERE l.avg_elo > w.avg_elo
          AND w.player_count = l.player_count
          AND m.startgametime > ?
        ORDER BY elo_diff DESC
        LIMIT ?
    `).all(after, limit);
  },
  getMatchesByDuration(limit = 3, team_games_only = false ) {
    const playerCountFilter =
      team_games_only ?
        'HAVING COUNT(pm.profile_id) >= 4' :
        'HAVING COUNT(pm.profile_id) = 2';

    const base = `
        SELECT
            m.match_id,
            m.duration,
            m.mapname,
            m.startgametime,
            json_group_array(json_object(
                'profile_id', pm.profile_id,
                'name', p.name,
                'god', pm.god,
                'win', pm.win,
                'team', pm.team
            )) AS players
        FROM matches m
        JOIN player_matches pm ON pm.match_id = m.match_id
        JOIN players p ON p.profile_id = pm.profile_id
        WHERE m.duration IS NOT NULL AND m.duration > 0 AND m.mapname NOT LIKE '_unknown%'
        GROUP BY m.match_id
        ${playerCountFilter}
    `;

    return {
      shortest: db.prepare(`${base} ORDER BY m.duration ASC LIMIT ?`).all(limit),
      longest: db.prepare(`${base} ORDER BY m.duration DESC LIMIT ?`).all(limit),
    };
  },
  getLatestMatches({ after = null, before = null, limit = 20, team_games_only = false, map = null, god = null } = {}) {
    const playerCountFilter =
      team_games_only ?
        'HAVING COUNT(pm.profile_id) >= 4' :
        'HAVING COUNT(pm.profile_id) = 2';

    const conditions = [];
    const params = [];

    if (after !== null) {
      conditions.push('m.startgametime > ?');
      params.push(after);
    }

    if (before !== null) {
      conditions.push('m.startgametime < ?');
      params.push(before);
    }

    if (map !== null) {
      conditions.push('m.mapname = ?');
      params.push(map);
    }

    if (god !== null) {
      conditions.push('EXISTS (SELECT 1 FROM player_matches pmg WHERE pmg.match_id = m.match_id AND pmg.god = ?)');
      params.push(god);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT
            m.match_id,
            m.duration,
            m.mapname,
            m.startgametime,
            json_group_array(json_object(
                'profile_id', pm.profile_id,
                'name', p.name,
                'god', pm.god,
                'win', pm.win,
                'team', pm.team
            )) AS players
        FROM matches m
        JOIN player_matches pm ON pm.match_id = m.match_id
        JOIN players p ON p.profile_id = pm.profile_id
        WHERE m.duration IS NOT NULL AND m.duration > 0 AND m.mapname NOT LIKE '_unknown%'
            ${whereClause}
        GROUP BY m.match_id
        ${playerCountFilter}
        ORDER BY m.startgametime DESC
        LIMIT ?
    `;

    params.push(limit);

    return db.prepare(query).all(...params);
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
        WHERE pm.match_id > ?
        GROUP BY pm.match_id,
                 m.startgametime;
    `).all(after);
  },
});

module.exports = {
  PlayerMatchesRepo,
};