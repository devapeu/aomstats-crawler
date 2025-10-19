const express = require('express');
//const fetch = require('node-fetch'); // add node-fetch if using Node <18
const Database = require('better-sqlite3');
const app = express();
const cors = require('cors');
const { insertMatches, computeAndUpdateTeamMatchIds, crawlPlayerMatches, getStats } = require('./dbHelpers');
const PLAYERS = require('./players');
const cron = require('node-cron');

const PORT = 3000;

app.use(cors({
  origin: '*'
}));

// Open or create DB
const db = new Database('./db.sqlite');

// Create table (adjust columns as needed)
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    match_id INTEGER,
    profile_id INTEGER,
    description TEXT,
    startgametime INTEGER,
    raw_data TEXT,
    win INTEGER,
    team_match_id TEXT,
    PRIMARY KEY(match_id, profile_id)
  )
`);


cron.schedule('0 9 * * *', async () => { // runs at 5 am EST
  try {
    const seen = new Set();
    const allMatches = [];

    const stmt = db.prepare(`SELECT MAX(startgametime) as latest FROM matches`);
    const result = stmt.get();
    const latestRecordDate = result.latest;

    for (const p of PLAYERS) {
      const matches = await crawlPlayerMatches(p, latestRecordDate);
      for (const m of matches) {
        const key = `${m.match_id}-${m.profile_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          allMatches.push(m);
        }
      }
    }

    insertMatches(db, allMatches);
    computeAndUpdateTeamMatchIds(db);

    console.log(`Fetched and saved ${allMatches.length} matches`);
  } catch (err) {
    console.error('Error in cron job:', err);
    const fs = require('fs');
    fs.appendFileSync('cron_errors.log', `[${new Date().toISOString()}] ${err.stack || err}\n`);
  }
});


app.get('/fetch/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const matches = await crawlPlayerMatches(profileId);
  insertMatches(matches);
  res.send(`Fetched and saved ${matches.length} matches for profile ${profileId}`);
});

app.get('/teams/:team_id', (req, res) => {
  const teamId = req.params.team_id;
  if (!teamId.includes(' vs ')) {
    return res.status(400).json({ error: 'Invalid team_id format' });
  }

  // Split the team_id into two teams of player IDs
  const [team1Str, team2Str] = teamId.split(' vs ');
  const team1 = team1Str.split(',').map(id => id.trim());
  const team2 = team2Str.split(',').map(id => id.trim());

  // Get the first player of team1 to determine perspective for win
  const firstPlayerId = team1[0];

  // Query DB for all matches with this team_match_id and profile_id
  const rows = db.prepare(`
    SELECT win FROM matches
    WHERE team_match_id = ? AND profile_id = ?
  `).all(teamId, firstPlayerId);

  if (!rows.length) {
    return res.json({ teams: null, message: 'No matches found for this team combination' });
  }

  // Count wins and losses for this player on this team_match_id
  const playerWins = rows.filter(r => r.win === 1).length;
  const playerLosses = rows.filter(r => r.win === 0).length;

  const response = {};
  response[team1] = playerWins;
  response[team2] = playerLosses;

  res.json(response);
});

app.get('/gods/:profile_id', (req, res) => {
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
})

app.get('/partners/:profile_id', getStats(db, PLAYERS, 'partners'));
app.get('/rivals/:profile_id', getStats(db, PLAYERS, 'rivals'));

app.get('/winstreak/:profile_id', (req, res) => {
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
    )
    SELECT g.streak_length
    FROM grouped g
    JOIN (
        SELECT MAX(last_match_id) AS last_match_id
        FROM grouped
    ) latest
      ON g.last_match_id = latest.last_match_id;
  `).all(req.params.profile_id);

  if (!query.length) {
    return res.json({ message: 'Unable to fetch data for this player' });
  }

  res.json({
    winstreak: query[0].streak_length,
  })
  
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});