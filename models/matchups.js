const Database = require('better-sqlite3');
const db = new Database('./db.sqlite');

const MatchupRepo = (db) => ({
  getPlayerWins(teamMatchId, profileId) {
    return db.prepare(`
        SELECT pm.win
        FROM player_matches pm
                 JOIN matches m ON m.match_id = pm.match_id
        WHERE m.team_match_id = ?
          AND pm.profile_id = ?
    `).all(teamMatchId, profileId);
  },
  getPlayerRelationshipWins(profileId, {
    type = 'rival',
    players = [],
    after = 0,
  } = {}) {

    const teamCondition =
      type === 'rival'
        ? 'pm.team != pm2.team'
        : 'pm.team = pm2.team';

    let playerFilterCondition = '';
    let params = [profileId, after];

    if (players.length > 0) {
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
});

module.exports = {
  MatchupRepo,
};