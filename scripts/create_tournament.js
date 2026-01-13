const Database = require('better-sqlite3');
const path = require('path');

// Require database/index.js to ensure tables are created
require('../database');

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

function createTournament(name) {
  if (!name) {
    console.error('Error: Tournament name is required');
    console.log('Usage: node create_tournament.js "Tournament Name"');
    process.exit(1);
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO tournaments (name, is_open)
      VALUES (?, 1)
    `);

    const result = stmt.run(name);
    console.log(`Tournament "${name}" created successfully with ID: ${result.lastInsertRowid}`);
  } catch (error) {
    console.error('Error creating tournament:', error.message);
    process.exit(1);
  }
}

// Get tournament name from command line arguments
const tournamentName = process.argv[2];

createTournament(tournamentName);

// Close the database connection
db.close();