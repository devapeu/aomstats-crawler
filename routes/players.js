const express = require('express');
const router = express.Router();

const { PlayerMatchesService } = require("../services/PlayerMatchesService");
const { EloService } = require("../services/EloService");

router.get('/gods/:profile_id', (req, res) => {
  const after = req.query.after ?? 0;
  const profileId = parseInt(req.params.profile_id);

  const rows = PlayerMatchesService.getPlayerWinsByGod(
    profileId,
    { after }
  );

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
  (req, res) => {
    const after = req.query.after ?? 0;
    const god = req.query.god ?? null;
    const profileId = parseInt(req.params.profile_id);

    const rows = PlayerMatchesService.getPlayerWinsByTeammate(
      profileId,
      { god, after }
    );

    if (!rows.length) {
      return res.json({ message: 'Unable to fetch data for this player' });
    }

    res.json({
      players: rows,
    });
  }
);

router.get(
  '/rivals/:profile_id',
  (req, res) => {
    const after = req.query.after ?? 0;
    const god = req.query.god ?? null;
    const profileId = parseInt(req.params.profile_id);

    const rows = PlayerMatchesService.getPlayerWinsVsPlayers(
      profileId,
      { god, after }
    );

    if (!rows.length) {
      return res.json({ message: 'Unable to fetch data for this player' });
    }

    res.json({
      players: rows,
    });
  }
);

router.get('/winstreak/:profile_id', (req, res) => {
  const profileId = parseInt(req.params.profile_id);
  const winstreak = PlayerMatchesService.getPlayerWinstreak(profileId);

  if (!winstreak) {
    return res.json({ message: 'Unable to fetch data for this player' });
  }

  res.json({
    winstreak: winstreak
  });
});

router.get('/elo/:profile_id', (req, res) => {
  const profileId = req.params.profile_id;
  const god = req.query.god ?? '';
  const scope = god ? 'god' : 'global';

  const elo = EloService.getElo(
    profileId,
    scope,
    god,
  );

  res.json({
    elo: elo
  });
});

router.get('/elos/:profile_id', (req, res) => {
  const profileId = parseInt(req.params.profile_id);

  const rows = EloService.getAllElo(profileId);

  if (!rows.length) {
    return res.json({ message: 'No data found for this player' });
  }

  res.json({
    elos: rows.map(row => ({
      elo: row.elo,
      god: row.scope_key,
    })),
  })
})

router.get('/elo-history/:profile_id', (req, res) => {
  const profileId = parseInt(req.params.profile_id);
  const rows = EloService.getEloHistory(profileId);

  if (!rows.length) {
    return res.json({ message: 'No data found for this player' });
  }

  const eloHistoryGroups = rows.reduce((acc, row) => {
    const god = row.god;
    if (!acc[god]) {
      acc[god] = []
    }

    acc[god].push({
      startgametime: row.startgametime * 1000,
      elo: row.new_elo,
    });

    return acc;
  }, {})

  res.json({
    rows: eloHistoryGroups
  })
});

module.exports = router;