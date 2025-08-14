const express = require('express');
//const fetch = require('node-fetch'); // add node-fetch if using Node <18
const Database = require('better-sqlite3');
const app = express();
const cors = require('cors');
const { insertMatches, computeAndUpdateTeamMatchIds } = require('./dbHelpers');
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
})


app.get('/fetch/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const matches = await crawlPlayerMatches(profileId);
  insertMatches(matches);
  res.send(`Fetched and saved ${matches.length} matches for profile ${profileId}`);
});

/*
app.get('/fetch-all', async(req, res) => {
  const seen = new Set();
  const allMatches = [];

  for (const p of PLAYERS) {
    const playerMatches = await crawlPlayerMatches(p);

    for (const match of playerMatches) {
      if (match.description === "AUTOMATCH") continue;
      const key = `${match.match_id}-${match.profile_id}`;
      if (!seen.has(key)){
        seen.add(key);
        allMatches.push(match);
      }
    }
  }

  insertMatches(db, allMatches);
  computeAndUpdateTeamMatchIds(db);
  res.send("Finished fetching all matches and saved to DB!");
});
*/

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

app.get('/partners/:profile_id', (req, res) => {
  const after = req.query.after ?? 0;
  const rows = db.prepare(`
    SELECT match_id, team_match_id, win 
    FROM matches 
    WHERE profile_id = ? AND startgametime > ?`
  ).all(req.params.profile_id, after);

  let playerCount = {};
  let total = 0;

  if (!rows.length) {
    return res.json({ message: 'Unable to fetch data for this player' });
  }

  rows.forEach(row => {
    const [team1, team2] = row.team_match_id.split(" vs ").map(t => t.split(","));
    const playerTeam = team1.includes(req.params.profile_id) ? team1 : team2;

    total++;
    
    if (!playerTeam) return;

    playerTeam.splice(playerTeam.indexOf(req.params.profile_id), 1);

    if (row.win === 1) {
      playerTeam.forEach(p => {
        if (!PLAYERS.includes(p)) return;
        
        if (!playerCount[p]) {
          playerCount[p] = 1;
        } else {
          playerCount[p]++
        }
      })
    }

  })

  res.json({
    players: playerCount,
    total: total,
  });
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function crawlPlayerMatches(profileId) {
  const allMatches = [];
  let before = Math.floor(Date.now() / 1000); // start now

  while (true) {
    const url = `https://aomstats.io/api/profile/${profileId}/matches?leaderboard=0&before=${before}`;
    const res = await fetch(url);
    const matches = await res.json();

    if (!matches.length) break;

    allMatches.push(...matches);

    const earliest = Math.min(...matches.map(m => m.startgametime));
    if (!earliest) break;

    before = earliest - 1; // step back
    await new Promise(r => setTimeout(r, 500)); // throttle
  }

  return allMatches;
}
