jest.mock("../database", () => ({
  db: {
    prepare: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('../models/matches', () => ({
  MatchesRepo: jest.fn(),
}));

jest.mock('../models/playerMatches', () => ({
  PlayerMatchesRepo: jest.fn(),
}));

jest.mock('../models/players', () => ({
  PlayersRepo: jest.fn(),
}));

const { MatchesRepo } = require('../models/matches');
const { PlayerMatchesRepo } = require('../models/playerMatches');
const { PlayersRepo } = require('../models/players');

const mockMatchesInsertMany = jest.fn();
const mockPlayerMatchesInsertMany = jest.fn();
const mockPlayersGetAll = jest.fn();

MatchesRepo.mockReturnValue({
  insertMany: mockMatchesInsertMany,
});

PlayerMatchesRepo.mockReturnValue({
  insertMany: mockPlayerMatchesInsertMany,
});

PlayersRepo.mockReturnValue({
  getAll: mockPlayersGetAll,
});

const { MatchService } = require('../services/matchService');

describe('MatchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayersGetAll.mockReturnValue([
      { profile_id: 1 },
      { profile_id: 10 },
      { profile_id: 15 },
      { profile_id: 20 },
      { profile_id: 30 },
      { profile_id: 40 },
      { profile_id: 99 },
    ]);
  });

  describe('computeTeamMatchIds', () => {
    it('computes team_match_id and team_god_match_id', () => {
      const playerMatches = [
        {
          match_id: 1,
          profile_id: 10,
          god: 'zeus',
          team: 0,
        },
        {
          match_id: 1,
          profile_id: 20,
          god: 'ra',
          team: 0,
        },
        {
          match_id: 1,
          profile_id: 30,
          god: 'odin',
          team: 1,
        },
        {
          match_id: 1,
          profile_id: 40,
          god: 'loki',
          team: 1,
        },
      ];

      const result = MatchService.computeTeamMatchIds(playerMatches);

      expect(result.get(1)).toEqual({
        team_match_id: '10,20 vs 30,40',
        team_god_match_id: '10[zeus],20[ra] vs 30[odin],40[loki]',
      });
    });

    it('is order agnostic', () => {
      const playerMatches = [
        {
          match_id: 2,
          profile_id: 99,
          god: 'thor',
          team: 1,
        },
        {
          match_id: 2,
          profile_id: 1,
          god: 'isis',
          team: 0,
        },
      ];

      const result = MatchService.computeTeamMatchIds(playerMatches);

      expect(result.get(2)).toEqual({
        team_match_id: '1 vs 99',
        team_god_match_id: '1[isis] vs 99[thor]',
      });
    });
  });

  describe('storeMatches', () => {
    it('stores valid matches and player matches', () => {
      const matches = [
        {
          match_id: 1,
          profile_id: 10,
          god: 'zeus',
          win: true,
          team: 0,
          description: 'RANKED',
          resulttype: 1,
          duration: 1000,
          startgametime: 123456,
          mapname: 'arena',
        },
        {
          match_id: 1,
          profile_id: 20,
          god: 'ra',
          win: false,
          team: 1,
          description: 'RANKED',
          resulttype: 1,
          duration: 1000,
          startgametime: 123456,
          mapname: 'arena',
        },
      ];

      MatchService.storeMatches(matches);

      expect(mockPlayerMatchesInsertMany).toHaveBeenCalledWith([
        {
          match_id: 1,
          profile_id: 10,
          god: 'zeus',
          win: 1,
          team: 0,
        },
        {
          match_id: 1,
          profile_id: 20,
          god: 'ra',
          win: 0,
          team: 1,
        },
      ]);

      expect(mockMatchesInsertMany).toHaveBeenCalledWith([
        {
          match_id: 1,
          description: 'RANKED',
          startgametime: 123456,
          mapname: 'arena',
          duration: 1000,
          team_match_id: '10 vs 20',
          team_god_match_id: '10[zeus] vs 20[ra]',
        },
      ]);
    });

    it('skips matches with more than 2 teams', () => {
      const matches = [
        {
          match_id: 1,
          profile_id: 10,
          god: 'Zeus',
          win: true,
          team: 0,
          description: 'RANKED',
          resulttype: 1,
          duration: 1000,
          startgametime: 1,
          mapname: 'arena',
        },
        {
          match_id: 1,
          profile_id: 15,
          god: 'Hades',
          win: false,
          team: 1,
          description: 'RANKED',
          resulttype: 0,
          duration: 1000,
          startgametime: 1,
          mapname: 'arena',
        },
        {
          match_id: 1,
          profile_id: 20,
          god: 'Ra',
          win: false,
          team: 2,
          description: 'RANKED',
          resulttype: 0,
          duration: 1000,
          startgametime: 1,
          mapname: 'arena',
        },
      ];

      MatchService.storeMatches(matches);

      expect(mockPlayerMatchesInsertMany).toHaveBeenCalledWith([]);
      expect(mockMatchesInsertMany).toHaveBeenCalledWith([]);
    });

    it('skips short games', () => {
      const matches = [
        {
          match_id: 1,
          profile_id: 10,
          god: 'Zeus',
          win: true,
          team: 0,
          description: 'RANKED',
          resulttype: 1,
          duration: 200,
          startgametime: 1,
          mapname: 'map',
        },
      ];

      MatchService.storeMatches(matches);

      expect(mockPlayerMatchesInsertMany).toHaveBeenCalledWith([]);
      expect(mockMatchesInsertMany).toHaveBeenCalledWith([]);
    });

    it('skips unranked games', () => {
      const matches = [
        {
          match_id: 1,
          profile_id: 10,
          god: 'Zeus',
          win: true,
          team: 0,
          description: 'AUTOMATCH',
          resulttype: 1,
          duration: 1000,
          startgametime: 1,
          mapname: 'map',
        },
      ];

      MatchService.storeMatches(matches);

      expect(mockPlayerMatchesInsertMany).toHaveBeenCalledWith([]);
      expect(mockMatchesInsertMany).toHaveBeenCalledWith([]);
    });

    it('skips desynced games', () => {
      const matches = [
        {
          match_id: 1,
          profile_id: 10,
          god: 'Zeus',
          win: true,
          team: 0,
          description: 'RANKED',
          resulttype: 4,
          duration: 1000,
          startgametime: 1,
          mapname: 'map',
        },
      ];

      MatchService.storeMatches(matches);

      expect(mockPlayerMatchesInsertMany).toHaveBeenCalledWith([]);
      expect(mockMatchesInsertMany).toHaveBeenCalledWith([]);
    });
  });
});