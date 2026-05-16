const Database = require('better-sqlite3');
const { ELO_DEFAULT } = require('../config/eloConfig');

// Open or create DB
const db = new Database('./db.sqlite');

db.exec("PRAGMA foreign_keys = ON");

// Create table (adjust columns as needed)
db.exec(`
    CREATE TABLE IF NOT EXISTS matches
    (
        match_id          INTEGER PRIMARY KEY,
        description       TEXT,
        startgametime     INTEGER,
        mapname           TEXT,
        duration          INTEGER,
        team_match_id     TEXT,
        team_god_match_id TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS players
    (
        profile_id INTEGER PRIMARY KEY,
        name       TEXT
    )`
);

db.exec(`
    CREATE TABLE IF NOT EXISTS player_matches
    (
        match_id   INTEGER,
        profile_id INTEGER,
        god        TEXT,
        win        INTEGER,
        team       INTEGER,
        PRIMARY KEY (match_id, profile_id),
        FOREIGN KEY (match_id) REFERENCES matches(match_id),
        FOREIGN KEY (profile_id) REFERENCES players(profile_id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS player_elo
    (
        profile_id   INTEGER,
        scope_type   TEXT,
        scope_key    TEXT NOT NULL DEFAULT '',
        elo          REAL DEFAULT ${ELO_DEFAULT},
        last_updated INTEGER,
        PRIMARY KEY (profile_id, scope_type, scope_key),
        FOREIGN KEY (profile_id) REFERENCES players(profile_id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS player_elo_meta
    (
        meta_key   TEXT,
        meta_value TEXT,
        scope      TEXT,
        PRIMARY KEY (meta_key, meta_value, scope)
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments
    (
        tournament_id INTEGER PRIMARY KEY,
        name          TEXT,
        is_open       INTEGER
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_matches
    (
        tournament_id INTEGER,
        match_id      INTEGER,
        FOREIGN KEY (tournament_id) REFERENCES tournaments (tournament_id),
        PRIMARY KEY (tournament_id, match_id)
    )
`)

module.exports = {
  db,
};