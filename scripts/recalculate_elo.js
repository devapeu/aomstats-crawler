const { EloService } = require('../services/EloService');

EloService.updateEloForMatches();
EloService.updateEloForMatches({scopeType: "god"});