const express = require('express');
const router = express.Router();
const { exportAsCSV } = require('../services/export_csv');
const { MatchService } = require('../services/MatchService');

router.get('/matchups', (req, res) => {
  const matchups = MatchService.getTopMatchups(20);
  res.json({ matchups });
});

router.get('/maps', (req, res) => {
  const maps = MatchService.getTopMaps(10);
  res.json({ maps });
});

router.get('/upsets', (req, res) => {
  const upsets = MatchService.getTopUpsets(10);
  res.json({ upsets });
});

router.get('/matches/duration', (req, res) => {
  const team_games_only = Object.hasOwn(req.query, "team_games_only");
  const { shortest, longest } = MatchService.getMatchesByDuration({ limit: 5, team_games_only: team_games_only });
  res.json({ shortest, longest });
});

router.get('/matches.csv', (req, res) => {
  const csv = exportAsCSV();

  const now = new Date();
  const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${timestamp}_matches.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;