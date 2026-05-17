const Database = require('better-sqlite3');
const db = new Database('./db.sqlite');

const PLAYERS = require('../players.js');

for (let player of PLAYERS) {
  db.prepare(`
      INSERT INTO players (profile_id, name)
      VALUES (?, ?)`
  ).run(player.profile_id, player.name)
}