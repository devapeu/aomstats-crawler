const express = require('express');
const router = express.Router();
const { crawlPlayerMatches } = require('../dbHelpers');
const { getStats } = require('../dbHelpers');
const { db, playerIds, insertMatches } = require('../services/database');
const { getPlayerElo } = require('../dbHelpers');

router.get('/fetch/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const matches = await crawlPlayerMatches(profileId);
  insertMatches(matches);
  res.send(`Fetched and saved ${matches.length} matches for profile ${profileId}`);
});

router.get('/gods/:profile_id', (req, res) => {
  const after = req.query.after ?? 0;
  const rows = db.prepare(`
    SELECT 
      god,
      COUNT(*) AS total_games,
      ROUND(
        COUNT(CASE WHEN win = 1 THEN 1 END) * 100.0 / COUNT(*),
        2
      ) AS winrate_percent
    FROM matches
    WHERE profile_id = ? AND startgametime > ?
    GROUP BY god
    ORDER BY total_games DESC`).all(req.params.profile_id, after);

  if (!rows.length) {
    return res.json({ god: null, message: 'No data found for this player' });
  }

  const response = {
    gods: rows.map(row => ({
      name: row.god,
      total_games: row.total_games,
      winrate_percent: row.winrate_percent
    }))
  };

  res.json(response);
});

router.get(
  '/partners/:profile_id',
  getStats(db, playerIds, 'partners', req => req.params.profile_id)
);

router.get(
  '/rivals/:profile_id',
  getStats(db, playerIds, 'rivals', req => req.params.profile_id)
);

router.get('/winstreak/:profile_id', (req, res) => {
  const query = db.prepare(`
  WITH streaks AS (
    SELECT
      profile_id,
      match_id,
      win,
      SUM(CASE WHEN win = 0 THEN 1 ELSE 0 END)
        OVER (PARTITION BY profile_id ORDER BY match_id ROWS UNBOUNDED PRECEDING) AS loss_group
    FROM matches
    WHERE profile_id = ?
  ),
  grouped AS (
    SELECT
      profile_id,
      loss_group,
      COUNT(*) AS streak_length,
      MAX(match_id) AS last_match_id
    FROM streaks
    WHERE win = 1
    GROUP BY profile_id, loss_group
  ),
  last_match AS (
    SELECT MAX(match_id) AS max_match_id
    FROM matches
    WHERE profile_id = ?
  )
  SELECT COALESCE(g.streak_length, 0) AS current_streak
  FROM last_match lm
  LEFT JOIN streaks s
    ON s.match_id = lm.max_match_id
  LEFT JOIN grouped g
    ON g.profile_id = s.profile_id AND g.loss_group = s.loss_group;
  `).all(req.params.profile_id, req.params.profile_id);

  if (!query.length) {
    return res.json({ message: 'Unable to fetch data for this player' });
  }

  res.json({
    winstreak: query[0].current_streak,
  });
});

router.get('/elo/:profile_id', (req, res) => {
  const profileId = req.params.profile_id;
  const elo = getPlayerElo(db, profileId);
  
  res.json({
    profile_id: profileId,
    elo: elo
  });
});

module.exports = router;