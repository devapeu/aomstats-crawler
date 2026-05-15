const {ELO_K_FACTOR, ELO_DIVISOR} = require("../config/eloConfig");

function calculateEloChange(ratingA, ratingB, actualScoreA, k = ELO_K_FACTOR) {
  const expectedScoreA = 1 / (1 + Math.pow(10, 5 * (ratingB - ratingA) / ELO_DIVISOR));
  return Math.round(k * (actualScoreA - expectedScoreA));
}


module.exports = {calculateEloChange};