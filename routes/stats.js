const PLAYERS = require('../players');
const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/stats', (req, res) => {
  // Maps
  const maps = db.prepare(`
    SELECT
      COUNT(DISTINCT match_id) AS count,
      mapname
    FROM matches
    WHERE mapname LIKE 'rm_%'
    GROUP BY mapname
    ORDER BY count DESC
    LIMIT 10
  `).all()

  // Matchups
  const matchups = db.prepare(`
    SELECT
      COUNT(DISTINCT match_id) AS count,
      team_match_id
    FROM matches
    GROUP BY team_match_id
    ORDER BY count DESC
    LIMIT 20
  `).all();

  let filteredMatchups = [];
  matchups.forEach(row => {
    const [t1, t2] = row.team_match_id.split(" vs ").map(t => t.split(","));
    if (t1.length === 1 && t2.length === 1 || t1[0] === " ") return;
    filteredMatchups.push( {
      team_match_id: row.team_match_id,
      count: row.count,
      team1: t1,
      team2: t2,
    })
  })

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

  res.json({ maps, elo, matchups: filteredMatchups })
})

module.exports = router;