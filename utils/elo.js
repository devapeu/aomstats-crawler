const {ELO_K_FACTOR, ELO_DIVISOR} = require("../config/eloConfig");

function calculateEloChange(
  ratingA,
  ratingB,
  actualScoreA,
  k = ELO_K_FACTOR
) {
  const expectedScoreA = 1 / (1 + Math.pow(10, 5 * (ratingB - ratingA) / ELO_DIVISOR));

  P_A = 1 / (1 + 10 ** ((team_B.team_strength - team_A.team_strength) / SCALE))

  const activityFactor = df_match.n_juegos.map(n_juegos =>
    n_juegos === 0
      ? 1
      : n_juegos > constante_factor_actividad_juegos
        ? 0.4
        : 0.4 + (
        0.6 * (
          (constante_factor_actividad_juegos - n_juegos) /
          constante_factor_actividad_juegos
        )
      )
  );


  return Math.round(k * (actualScoreA - expectedScoreA));
}

module.exports = {calculateEloChange};