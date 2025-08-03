const express = require('express');
//const fetch = require('node-fetch'); // add node-fetch if using Node <18
const Database = require('better-sqlite3');
const app = express();
const PORT = 3000;

const PLAYERS = [
  '1074827715',
  '1074199836',
  '1073862520',
  '1074875183',
  '1074196830',
  '1074910820',
  '1075027222',
  '1074849746',
  '1074203172',
  '1074839111',
  '1075268390'
];

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
    team_match_id TEXT,
    PRIMARY KEY(match_id, profile_id)
  )
`);

// Prepared statement for inserts
const insertMatch = db.prepare(`
  INSERT OR IGNORE INTO matches (match_id, profile_id, description, startgametime, raw_data, team_match_id)
  VALUES (@match_id, @profile_id, @description, @startgametime, @raw_data, @team_match_id)
`);

// Insert matches into DB
function insertMatches(matches) {
  const insertMany = db.transaction((matches) => {
    for (const m of matches) {
      if (m.description === "AUTOMATCH") continue;

      insertMatch.run({
        match_id: m.match_id,
        profile_id: m.profile_id,
        description: m.description,
        startgametime: m.startgametime,
        win: m.win,
        raw_data: JSON.stringify(m),
        team_match_id: null,
      });
    }
  });

  insertMany(matches);
}

function computeAndUpdateTeamMatchIds() {
  const matchIds = db.prepare('SELECT DISTINCT match_id FROM matches').all();

  const updateStmt = db.prepare('UPDATE matches SET team_match_id = ? WHERE match_id = ?');

  for (const { match_id } of matchIds) {
    const players = db.prepare('SELECT profile_id, raw_data FROM matches WHERE match_id = ?').all(match_id);

    // Parse player data (raw_data contains full player info)
    const playerObjs = players.map(p => JSON.parse(p.raw_data));

    // Group players by team (assuming 'team' field in player object)
    const team1 = playerObjs.filter(p => p.team === 0).map(p => p.profile_id).sort();
    const team2 = playerObjs.filter(p => p.team === 1).map(p => p.profile_id).sort();

    // Sort teams lex order to be order-agnostic
    const sortedTeams = [team1, team2].sort((a,b) => a.join(',').localeCompare(b.join(',')));
    const teamMatchId = sortedTeams.map(t => t.join(',')).join(' vs ');

    updateStmt.run(teamMatchId, match_id);
  }
}

app.get('/fetch/:profileId', async (req, res) => {
  const { profileId } = req.params;
  const matches = await crawlPlayerMatches(profileId);
  insertMatches(matches);
  computeAndUpdateTeamMatchIds();
  res.send(`Fetched and saved ${matches.length} matches for profile ${profileId}`);
});

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

  insertMatches(allMatches);
  res.send("Finished fetching all matches and saved to DB!");
});

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
