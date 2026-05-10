jest.mock('../models/playerMatches', () => ({
  PlayerMatchesRepo: {
    getPlayerWins: jest.fn(),
    getPlayerRelationshipWins: jest.fn(),
  }
}));

jest.mock('../models/elo', () => ({
  EloRepo: {
    getPlayersElo: jest.fn(),
  }
}));

jest.mock('../config/eloConfig', () => ({
  ELO_SIZE_ADVANTAGE_PER_PLAYER: 250,
  WIN_PROB_SIZE_MULTIPLIER_BASE: 1.2,
  ELO_DIVISOR: 400,
}));

const { PlayerMatchesRepo } = require('../models/playerMatches');
const { EloRepo } = require('../models/elo');

const { MatchupService } = require('../services/MatchupService');

describe('MatchupService.getMatchupScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates matchup wins correctly', () => {
    PlayerMatchesRepo.getPlayerWins.mockReturnValue([
      { win: 1 },
      { win: 1 },
      { win: 0 },
      { win: 1 },
    ]);

    const result = MatchupService.getMatchupScore(
      [{profile_id: 102}, {profile_id: 101}],
      [{profile_id: 103}, {profile_id: 104}],
    );

    expect(PlayerMatchesRepo.getPlayerWins)
      .toHaveBeenCalledWith(
        '101,102 vs 103,104',
        102,
        { scope: 'player' }
      );

    expect(result).toEqual([3, 1]);
  });

  it('accepts god name in player data', () => {
    PlayerMatchesRepo.getPlayerWins.mockReturnValue([
      { win: 1 },
      { win: 1 },
      { win: 0 },
      { win: 1 },
    ]);

    const result = MatchupService.getMatchupScore(
      [{profile_id: 102, god: 'zeus'}, {profile_id: 101, god: 'hades'}],
      [{profile_id: 103, god: 'poseidon'}, {profile_id: 104, god: 'thor'}],
    );

    expect(PlayerMatchesRepo.getPlayerWins)
      .toHaveBeenCalledWith(
        '101[hades],102[zeus] vs 103[poseidon],104[thor]',
        102,
        { scope: 'god' }
      );

    expect(result).toEqual([3, 1]);

  })

  it('accepts civ name in player data', () => {
    PlayerMatchesRepo.getPlayerWins.mockReturnValue([
      { win: 1 },
      { win: 1 },
      { win: 0 },
      { win: 1 },
    ]);

    const result = MatchupService.getMatchupScore(
      [{profile_id: 102, civ: 'greek'}, {profile_id: 101, civ: 'egyptian'}],
      [{profile_id: 103, civ: 'atlantean'}, {profile_id: 104, civ: 'norse'}],
    );

    expect(PlayerMatchesRepo.getPlayerWins)
      .toHaveBeenCalledWith(
        '101[egyptian],102[greek] vs 103[atlantean],104[norse]',
        102,
        { scope: 'civ' }
      );

    expect(result).toEqual([3, 1]);

  })

  it('returns zeroed scores when no games exist', () => {
    PlayerMatchesRepo.getPlayerWins.mockReturnValue([]);

    const result = MatchupService.getMatchupScore(
      [{profile_id: 102}, {profile_id: 101}],
      [{profile_id: 103}, {profile_id: 104}],
    );

    expect(result).toEqual([0, 0]);
  });
});

describe('MatchupService.getMatchupOdds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns probability favoring stronger Elo team', () => {
    EloRepo.getPlayersElo.mockReturnValue([
      { profile_id: 1, elo: 1800 },
      { profile_id: 2, elo: 1750 },
      { profile_id: 3, elo: 1400 },
      { profile_id: 4, elo: 1450 },
    ]);

    PlayerMatchesRepo.getPlayerRelationshipWins.mockReturnValue({
      players: {}
    });

    const result = MatchupService.getMatchupOdds(
      [1, 2],
      [3, 4]
    );

    expect(result).toBeGreaterThan(0.5);
  });

  it('uses historical matchup data when available', () => {
    EloRepo.getPlayersElo.mockReturnValue([
      { profile_id: 1, elo: 1500 },
      { profile_id: 2, elo: 1500 },
    ]);

    PlayerMatchesRepo.getPlayerRelationshipWins.mockReturnValue({
      players: {
        2: {
          wins: 8,
          total: 10,
        }
      }
    });

    const result = MatchupService.getMatchupOdds(
      [1],
      [2]
    );

    expect(result).toBeGreaterThan(0.5);
  });

  it('falls back to Elo-only probability without historical data', () => {
    EloRepo.getPlayersElo.mockReturnValue([
      { profile_id: 1, elo: 1600 },
      { profile_id: 2, elo: 1400 },
    ]);

    PlayerMatchesRepo.getPlayerRelationshipWins.mockReturnValue({
      players: {}
    });

    const result = MatchupService.getMatchupOdds(
      [1],
      [2]
    );

    expect(result).toBeGreaterThan(0.5);
  });

  it('handles equal Elo teams near 50 percent', () => {
    EloRepo.getPlayersElo.mockReturnValue([
      { profile_id: 1, elo: 1500 },
      { profile_id: 2, elo: 1500 },
    ]);

    PlayerMatchesRepo.getPlayerRelationshipWins.mockReturnValue({
      players: {}
    });

    const result = MatchupService.getMatchupOdds(
      [1],
      [2]
    );

    expect(result).toBeCloseTo(0.5, 1);
  });

  it('applies team size advantage', () => {
    EloRepo.getPlayersElo.mockReturnValue([
      { profile_id: 1, elo: 1500 },
      { profile_id: 2, elo: 1500 },
      { profile_id: 3, elo: 1500 },
    ]);

    PlayerMatchesRepo.getPlayerRelationshipWins.mockReturnValue({
      players: {}
    });

    const result = MatchupService.getMatchupOdds(
      [1, 2],
      [3]
    );

    expect(result).toBeGreaterThan(0.5);
  });

  it('never exceeds probability bounds', () => {
    EloRepo.getPlayersElo.mockReturnValue([
      { profile_id: 1, elo: 3000 },
      { profile_id: 2, elo: 500 },
    ]);

    PlayerMatchesRepo.getPlayerRelationshipWins.mockReturnValue({
      players: {
        2: {
          wins: 100,
          total: 100,
        }
      }
    });

    const result = MatchupService.getMatchupOdds(
      [1],
      [2]
    );

    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});