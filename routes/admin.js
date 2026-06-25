const express = require('express');
const router = express.Router();
const validateAdminAuth = require('../middleware/validateAdminAuth');
const { ADMIN_PASSWORD } = require('../config');
const { PlayersRepo } = require('../models/players');
const { MatchService } = require('../services/MatchService');
const { EloService } = require('../services/EloService');
const { db } = require('../database');

const Players = PlayersRepo(db);

const MIN_MATCH_DURATION = 480; // 8 minutes, matches MatchService.isSkippable threshold

router.post('/admin/login', (req, res) => {
  const { password } = req.body;

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      code: 401,
      message: 'Contraseña incorrecta'
    });
  }

  res.json({
    code: 200,
    token: ADMIN_PASSWORD
  });
});

router.post('/admin/matches', validateAdminAuth, (req, res) => {
  try {
    const { mapname, startgametime, duration, team1, team2, winner } = req.body;

    if (!mapname || typeof mapname !== 'string') {
      return res.status(400).json({ code: 400, message: 'Falta el mapa de la partida.' });
    }

    if (!Array.isArray(team1) || !Array.isArray(team2) || team1.length === 0 || team2.length === 0) {
      return res.status(400).json({ code: 400, message: 'Ambos equipos deben tener al menos un jugador.' });
    }

    if (winner !== 1 && winner !== 2) {
      return res.status(400).json({ code: 400, message: 'Debes indicar qué equipo ganó.' });
    }

    const durationSeconds = Number(duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_MATCH_DURATION) {
      return res.status(400).json({ code: 400, message: 'La duración debe ser de al menos 8 minutos.' });
    }

    const startgametimeSeconds = Number(startgametime) || Math.floor(Date.now() / 1000);

    const allPlayers = [...team1, ...team2];
    if (allPlayers.some(p => !p.profile_id || !p.god)) {
      return res.status(400).json({ code: 400, message: 'Cada jugador necesita un profile_id y un dios.' });
    }

    // Ensure players exist so they aren't dropped as invalid by MatchService.storeMatches
    Players.insertMany(allPlayers.map(p => ({ profile_id: p.profile_id, name: p.name })));

    const matchId = -Date.now();

    const buildRows = (players, team, win) => players.map(p => ({
      match_id: matchId,
      description: 'MANUAL',
      startgametime: startgametimeSeconds,
      mapname,
      duration: durationSeconds,
      profile_id: p.profile_id,
      god: p.god,
      win,
      team,
    }));

    const rows = [
      ...buildRows(team1, 0, winner === 1 ? 1 : 0),
      ...buildRows(team2, 1, winner === 2 ? 1 : 0),
    ];

    MatchService.storeMatches(rows);

    // Manual matches use a negative match_id so they never collide with real
    // aomstats.io ids, but that also means they'd never satisfy the
    // `match_id > last_processed_match` cursor used by EloService.updateEloForMatches
    // (which assumes monotonically increasing real ids). Update this match's Elo
    // directly instead, without touching that shared cursor.
    const matchForElo = {
      match_id: matchId,
      startgametime: startgametimeSeconds,
      team_a: JSON.stringify(team1.map(p => ({ profile_id: p.profile_id, god: p.god, win: winner === 1 ? 1 : 0 }))),
      team_b: JSON.stringify(team2.map(p => ({ profile_id: p.profile_id, god: p.god, win: winner === 2 ? 1 : 0 }))),
    };

    EloService.updateMatchElo(matchForElo, 'global');
    EloService.updateMatchElo(matchForElo, 'god');

    res.json({
      code: 200,
      match_id: matchId,
    });
  } catch (e) {
    console.error('Error creating manual match:', e);
    res.status(500).json({
      code: 500,
      message: e.message || 'Internal server error.'
    });
  }
});

module.exports = router;
