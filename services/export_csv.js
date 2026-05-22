const path = require('path');
const Database = require('better-sqlite3');
const PLAYERS = require(path.resolve(__dirname, '..', 'players.js'));

const dbPath = path.resolve(__dirname, '..', 'db.sqlite');
const db = new Database(dbPath);

function exportAsCSV() {
    const stmt = db.prepare(`
        SELECT
            m.match_id,
            GROUP_CONCAT(
              CASE WHEN pm.win = 1
                       THEN p.name || '[' || pm.god || ']'
                  END,
              '-'
            ) AS winners,
            GROUP_CONCAT(
              CASE WHEN pm.win = 0
                       THEN p.name || '[' || pm.god || ']'
                  END,
              '-'
            ) AS losers,
            m.startgametime AS timestamp,
            m.duration,
            CASE
                WHEN COUNT(*) = 2 THEN 1
                ELSE 0
                END AS is_1v1
        FROM matches m
                 JOIN player_matches pm
                      ON pm.match_id = m.match_id
                 JOIN players p
                      ON p.profile_id = pm.profile_id
        GROUP BY m.match_id
        ORDER BY m.match_id
    `);

    const rows = stmt.all();

    const header =
      "match_id,winners,losers,timestamp,duration,is_1v1";

    const lines = rows
      .filter(row => (row.losers && row.winners))
      .map(row => [
        row.match_id,
        row.winners,
        row.losers,
        row.timestamp,
        row.duration,
        row.is_1v1,
    ].join(","));

    return [header, ...lines].join("\n");
}

module.exports = {
    exportAsCSV,
}