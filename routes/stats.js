const PLAYERS = require('../players');
const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/stats', (req, res) => {
  // Maps
  const maps = db.prepare(`
    SELECT
      COUNT(*) AS count,
      mapname
    FROM matches
    WHERE mapname LIKE 'rm_%'
    GROUP BY mapname
    ORDER BY count DESC
    LIMIT 10
  `).all()

  // Elo
  const playerKeys = Object.keys(PLAYERS)

  let elo = []

  if (playerKeys.length > 0) {
    const placeholders = playerKeys.map(() => "?").join(",")

    elo = db.prepare(`
      SELECT profile_id, elo
      FROM player_elo
      WHERE profile_id IN (${placeholders})
      ORDER BY elo DESC
    `).all(...playerKeys)
  }

  res.json({ maps, elo })
})

module.exports = router;