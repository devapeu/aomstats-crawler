const Database = require('better-sqlite3');
const path = require('path');

// Require database/index.js to ensure tables are created
require('../database');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

function addMatchToTournament(tournamentId, matchId) {
  if (!tournamentId || !matchId) {
    console.error('Error: Both tournament ID and match ID are required');
    console.log('Usage: node add_match_to_tournament.js <tournament_id> <match_id>');
    process.exit(1);
  }

  // Validate that tournament exists and is open
  const tournamentStmt = db.prepare(`
    SELECT tournament_id, name, is_open FROM tournaments WHERE tournament_id = ?
  `);
  const tournament = tournamentStmt.get(tournamentId);

  if (!tournament) {
    console.error(`Error: Tournament with ID ${tournamentId} does not exist`);
    process.exit(1);
  }

  if (tournament.is_open === 0) {
    console.error(`Error: Tournament "${tournament.name}" is closed`);
    process.exit(1);
  }

  // Validate that match exists
  const matchStmt = db.prepare(`
    SELECT match_id FROM matches WHERE match_id = ? LIMIT 1
  `);
  const match = matchStmt.get(matchId);

  if (!match) {
    console.error(`Error: Match with ID ${matchId} does not exist`);
    console.log('Note: Make sure to run fetch_latest.js or similar script to populate matches first');
    process.exit(1);
  }

  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO tournament_matches (tournament_id, match_id)
      VALUES (?, ?)
    `);

    const result = stmt.run(tournamentId, matchId);

    if (result.changes > 0) {
      console.log(`Match ${matchId} added to tournament "${tournament.name}" successfully`);
    } else {
      console.log(`Match ${matchId} is already in tournament "${tournament.name}"`);
    }
  } catch (error) {
    console.error('Error adding match to tournament:', error.message);
    process.exit(1);
  }
}

// Get arguments from command line
const tournamentId = parseInt(process.argv[2]);
const matchId = parseInt(process.argv[3]);

addMatchToTournament(tournamentId, matchId);

// Close the database connection
db.close();