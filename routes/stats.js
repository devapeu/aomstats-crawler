const express = require('express');
const router = express.Router();
const { exportAsCSV } = require('../services/export_csv');
const { MatchService } = require('../services/MatchService');

router.get('/matchups', (req, res) => {
  const matchups = MatchService.getTopMatchups(20);
  res.json({ matchups });
});

router.get('/maps', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const maps = MatchService.getTopMaps(limit);
  res.json({ maps });
});

router.get('/upsets', (req, res) => {
  const after = req.query.after ?? 0;
  const upsets = MatchService.getTopUpsets(10, after);
  res.json({ upsets });
});

router.get('/matches', (req, res) => {
  const after = req.query.after ? Number(req.query.after) : null;
  const before = req.query.before ? Number(req.query.before) : null;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const team_games_only = Object.hasOwn(req.query, "team_games_only");
  const map = req.query.map ?? null;
  const god = req.query.god ?? null;
  const players = req.query.players
    ? req.query.players.split(',').map(Number)
    : null;
  const players_match_all = Object.hasOwn(req.query, "players_match_all");

  const matches = MatchService.getLatestMatches({ after, before, limit, team_games_only, map, god, players, players_match_all });
  res.json({ matches });
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