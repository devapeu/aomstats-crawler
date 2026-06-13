const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

const profile_id = process.argv[2];

if (!profile_id) {
  console.error("Usage: node delete_player_matches.js <profile_id>");
  process.exit(1);
}

const tx = db.transaction((profile_id) => {
  const matchRows = db.prepare(`
      SELECT DISTINCT match_id
      FROM player_matches
      WHERE profile_id = ?
  `).all(profile_id);

  const matchIds = matchRows.map(row => row.match_id);

  if (matchIds.length === 0) {
    return 0;
  }

  const deletePlayerMatchesByMatch = db.prepare(`
      DELETE FROM player_matches
      WHERE match_id = ?
  `);

  const deleteEloHistoryByMatch = db.prepare(`
      DELETE FROM player_elo_history
      WHERE match_id = ?
  `);

  const deleteTournamentMatch = db.prepare(`
      DELETE FROM tournament_matches
      WHERE match_id = ?
  `);

  const deleteMatch = db.prepare(`
      DELETE FROM matches
      WHERE match_id = ?
  `);

  for (const match_id of matchIds) {
    deletePlayerMatchesByMatch.run(match_id);
    deleteEloHistoryByMatch.run(match_id);
    deleteTournamentMatch.run(match_id);
    deleteMatch.run(match_id);
  }

  return matchIds.length;
});

const deletedCount = tx(profile_id);

console.log(`Deleted ${deletedCount} matches for profile_id ${profile_id}.`);