const insertMatches = (db, matches) => {
  const insertMatch = db.prepare(`
    INSERT OR IGNORE INTO matches (match_id, profile_id, description, startgametime, win, raw_data, team_match_id)
    VALUES (@match_id, @profile_id, @description, @startgametime, @win, @raw_data, @team_match_id)
  `);

  const insertMany = db.transaction((matches) => {
    for (const m of matches) {
      if (m.description === "AUTOMATCH") continue;

      insertMatch.run({
        match_id: m.match_id,
        profile_id: m.profile_id,
        description: m.description,
        startgametime: m.startgametime,
        win: m.win ? 1 : 0,
        raw_data: JSON.stringify(m),
        team_match_id: null,
      });
    }
  });

  insertMany(matches);
};

const computeAndUpdateTeamMatchIds = () => {
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

const crawlPlayerMatches = async (profileId) => {
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

module.exports = { insertMatches, computeAndUpdateTeamMatchIds, crawlPlayerMatches };