class MatchupIdError extends Error {
  constructor(message) {
    super(message);
    this.name = "MatchupIdError";
  }
}

const normalizeTeam = (team, scope) => {
  return team
    .map(p => {
      const id = p.profile_id;

      if (!p.profile_id) throw new MatchupIdError(`One player is missing a profile_id.`);

      if (scope === "god") {
        if (!p.god) throw new MatchupIdError(`Missing god for profile_id=${id}`);
        return `${id}[${p.god}]`;
      }

      if (scope === "civ") {
        if (!p.civ) throw new MatchupIdError(`Missing civ name for profile_id=${id}`);
        return `${id}[${p.civ}]`;
      }

      if (scope === "global") {
        return String(id);
      }

      throw new MatchupIdError(`Invalid scope: ${scope}`);
    })
    .sort((a, b) => a.localeCompare(b));
};

const buildMatchupIdFromTeams = (team1, team2, scope = "global") => {
  const t1 = normalizeTeam(team1, scope);
  const t2 = normalizeTeam(team2, scope);

  const sortedTeams = [t1, t2].sort((a, b) => a.join(',').localeCompare(b.join(',')))
  return sortedTeams.map(t => t.join(',')).join(' vs ')
};

module.exports = {
  buildMatchupIdFromTeams,
  MatchupIdError
};