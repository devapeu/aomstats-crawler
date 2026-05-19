const express = require('express');
const {MatchupService} = require("../services/MatchupService");
const router = express.Router();

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
    const team1Str = team1.map(p => String(p.profile_id));
    const team2Str = team2.map(p => String(p.profile_id));

    const probability = MatchupService.getMatchupOdds(team1, team2);
    const { score, history } = MatchupService.getMatchupScore(team1, team2);

    const team1Probability = Math.round(probability * 10000) / 100;
    const team2Probability = 100 - team1Probability;

    res.json({
      code: 200,
      data: {
        teams: {
          [team1Str.join(',')]: { wins: score[0], probability: team1Probability },
          [team2Str.join(',')]: { wins: score[1], probability: team2Probability },
        },
        history : history,
      }
    });

  } catch (e) {
    console.error('Error computing matchup data:', e);
    res.status(500).json({
      code: 500,
      message: e.message || 'Internal server error.'
    });
  }
});

module.exports = router;