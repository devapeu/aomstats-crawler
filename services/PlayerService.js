const { PlayersRepo } = require("../models/players");
const { db } = require("../database");

const Players = PlayersRepo(db);

const PlayerService = {
  getAllPlayers() {
    return Players.getAll();
  },
  getAllPlayersIds() {
    const players = this.getAllPlayers();
    return players.map(player => player.profile_id);
  }
};

module.exports = {
  PlayerService
};