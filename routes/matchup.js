const express = require('express');
const router = express.Router();
const { calculateWinProbability, getWins } = require('../dbHelpers');
const { db } = require('../services/database');

router.post('/matchup', async (req, res) => {
  try {
    const { team1, team2 } = req.body;
    if (!Array.isArray(team1) || !Array.isArray(team2) || team1.length === 0 || team2.length === 0) {
      return res.status(400).json({
        code: 400,
        message: 'Both team1 and team2 must be non-empty arrays.'
      });
    }
    // Coerce all IDs to strings
    const team1Str = team1.map(String);
    const team2Str = team2.map(String);

    const probability = await calculateWinProbability(db, team1Str, team2Str);
    const [team1Wins, team2Wins] = await getWins(db, team1Str, team2Str);

    const team1Probability = Math.round(probability * 10000) / 100;
    const team2Probability = 100 - team1Probability;

    res.json({
      code: 200,
      data: {
        [team1Str.join(',')]: { wins: team1Wins, probability: team1Probability },
        [team2Str.join(',')]: { wins: team2Wins, probability: team2Probability },
      }
    });

  } catch (e) {
    console.error('Error computing matchup data:', e);
    res.status(500).json({
      code: 500,
      message: err.message || 'Internal server error.'
    });
  }
});

module.exports = router;