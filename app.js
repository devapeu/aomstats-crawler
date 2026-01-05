const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const cors = require('cors');
const { insertMatches, computeAndUpdateTeamMatchIds, crawlPlayerMatches, getStats, getWins, calculateWinProbability } = require('./dbHelpers');
const PLAYERS = require('./players');
const cron = require('node-cron');

const PORT = 3000;
const API_KEY = process.env.DISCORD_WEBHOOK_API_KEY || '1e7a2a92-83c2-43e0-b092-f63b39e33da0';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1442702610384556052/cjkAtIJsBydyhEUnzADdIo0Mtk0bsZ70VOwAckZ2VgnfwDXYjTFTzW28C_S6vsNupOpQ';

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Middleware to validate API key
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      code: 401,
      message: 'Unauthorized: Invalid or missing API key'
    });
  }
  
  next();
};

// Open or create DB
const db = new Database('./db.sqlite');

// Use player IDs (keys) to perform loops
const playerIds = Object.keys(PLAYERS);

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

    for (const p of playerIds) {
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

app.get(
  '/partners/:profile_id',
  getStats(db, playerIds, 'partners', req => req.params.profile_id)
);

app.get(
  '/rivals/:profile_id',
  getStats(db, playerIds, 'rivals', req => req.params.profile_id)
);

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
  })
  
})

// Discord webhook endpoint
app.post('/send-planner-to-discord', validateApiKey, async (req, res) => {
  try {
    // Validate request body
    if (!req.body.imageBase64 || !req.body.message) {
      return res.status(400).json({
        code: 400,
        message: 'Missing required fields: imageBase64 and message'
      });
    }

    // Validate Discord webhook URL is configured
    if (!DISCORD_WEBHOOK_URL) {
      console.error('Discord webhook URL not configured');
      return res.status(500).json({
        code: 500,
        message: 'Discord webhook not configured on server'
      });
    }

    const { imageBase64, message } = req.body;

    // Convert base64 to buffer
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(imageBase64, 'base64');
    } catch (err) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid base64 image data'
      });
    }

    const FormData = require('form-data');
    const axios = require('axios');
    const form = new FormData();
    form.append('file', imageBuffer, { filename: 'teams.png', contentType: 'image/png' });
    form.append('content', message);

    // Send to Discord 
    let discordRes;
    try {
      discordRes = await axios.post(DISCORD_WEBHOOK_URL, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 15000
      });
    } catch (err) {      
      const status = err.response?.status;
      const data = err.response?.data || err.message;
      console.error(`Discord webhook failed: ${status || 'ERR'} ${JSON.stringify(data)}`);
      return res.status(502).json({
        code: 502,
        message: `Discord webhook failed with status ${status || 'error'}`
      });
    }

    if (discordRes.status < 200 || discordRes.status >= 300) {
      console.error(`Discord webhook returned non-2xx: ${discordRes.status} ${JSON.stringify(discordRes.data)}`);
      return res.status(502).json({
        code: 502,
        message: `Discord webhook failed with status ${discordRes.status}`
      });
    }

    res.json({
      code: 200,
      message: 'Image sent to Discord successfully'
    });

  } catch (err) {
    console.error('Error sending to Discord:', err);
    res.status(500).json({
      code: 500,
      message: `Server error: ${err.message}`
    });
  }
});

app.post('/matchup', async (req, res) => {
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

    const team2Probability = Math.round(probability * 10000) / 100;
    const team1Probability = 100 - team2Probability;

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});