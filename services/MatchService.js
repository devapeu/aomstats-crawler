const { MatchesRepo } = require('../models/matches');
const { PlayerMatchesRepo } = require("../models/playerMatches");
const { PlayersRepo } = require("../models/players");
const { db } = require("../database");

const Matches = MatchesRepo(db);
const Players = PlayersRepo(db);
const PlayerMatches = PlayerMatchesRepo(db);

function isSkippable(m) {
    // invalidate unranked games, de-synced games and games under 8 minutes
    return m.description === "AUTOMATCH" || m.resulttype === 4 || m.duration < 480;
}

function sortTeams(team1, team2) {
    // Sort teams lex order to be order-agnostic
    const sortedTeams = [team1, team2].sort((a,b) => a.join(',').localeCompare(b.join(',')));
    return sortedTeams.map(t => t.join(',')).join(' vs ');
}

const MatchService = {
    storeMatches(matches) {
        const badMatchIds = new Set();
        const players = Players.getAll();
        const playerIds = new Set(players.map(player => player.profile_id));

        // find matches that had a player on a third, fourth, fifth... team
        for (const m of matches) {
            if (m.team > 1 || !playerIds.has(m.profile_id)) {
                badMatchIds.add(m.match_id);
            }
        }

        const matchMap = new Map();
        const validPlayerMatches = [];

        for (const m of matches) {
            // invalidate any match that contains more than 2 teams
            if (badMatchIds.has(m.match_id)) continue;

            if (isSkippable(m)) continue;

            if (!matchMap.has(m.match_id)) {
                matchMap.set(m.match_id, {
                    match_id: m.match_id,
                    description: m.description,
                    startgametime: m.startgametime,
                    mapname: m.mapname,
                    duration: m.duration,
                    team_match_id: null,
                    team_god_match_id: null,
                });
            }

            validPlayerMatches.push({
                match_id: m.match_id,
                profile_id: m.profile_id,
                god: m.god,
                win: m.win ? 1 : 0,
                team: m.team,
            })
        }

        const validMatches = [...matchMap.values()];

        const teamMatchIds = this.computeTeamMatchIds(validPlayerMatches);
        for (const match of validMatches) {
            const id = teamMatchIds.get(match.match_id);

            match.team_match_id = id?.team_match_id || null;
            match.team_god_match_id = id?.team_god_match_id || null;
        }

        Matches.insertMany(validMatches);
        PlayerMatches.insertMany(validPlayerMatches);
    },
    computeTeamMatchIds(playerMatches) {
        let result = new Map();
        const matchIds = [... new Set(playerMatches.map(pm => pm.match_id)) ];

        for (let match_id of matchIds) {
            const playersInMatch = playerMatches.filter(pm => pm.match_id === match_id);

            if (playersInMatch.length > 0) {
                const team0 = playersInMatch.filter(pm => pm.team === 0);
                const team1 = playersInMatch.filter(pm => pm.team === 1);

                const buildTeam = (players, mapper) => players.map(mapper).sort();

                const plainTeam1 = buildTeam(team0, p => `${p.profile_id}`);
                const plainTeam2 = buildTeam(team1, p => `${p.profile_id}`);

                const godTeam1 = buildTeam(team0,p => `${p.profile_id}[${p.god}]`);
                const godTeam2 = buildTeam(team1,p => `${p.profile_id}[${p.god}]`);

                result.set(match_id, {
                    team_match_id: sortTeams(plainTeam1, plainTeam2),
                    team_god_match_id: sortTeams(godTeam1, godTeam2),
                });
            }
        }

        return result;
    },
    getLatestDate() {
        const row = db.prepare(`SELECT MAX(startgametime) as latest FROM matches`).get();
        return row?.latest ?? 0;
    }
}

module.exports = {
    MatchService,
}