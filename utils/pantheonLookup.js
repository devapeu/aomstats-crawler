
const PANTHEON_LIST = {
  "zeus": "greek",
  "hades": "greek",
  "poseidon": "greek",
  "demeter": "greek",
  "ra": "egyptian",
  "isis": "egyptian",
  "set": "egyptian",
  "thor": "norse",
  "odin": "norse",
  "loki": "norse",
  "freyr": "norse",
  "kronos": "atlantean",
  "oranos": "atlantean",
  "gaia": "atlantean",
  "fuxi": "chinese",
  "shennong": "chinese",
  "nuwa": "chinese",
  "amaterasu": "japanese",
  "susanoo": "japanese",
  "tsukuyomi": "japanese",
  "huitzilopochtli": "aztec",
  "tezcatlipoca": "aztec",
  "quetzalcoatl": "aztec",
}

const GODS_LIST = Object.entries(PANTHEON_LIST).reduce(
  (acc, [god, pantheon]) => {
    if (!acc[pantheon]) acc[pantheon] = [];
    acc[pantheon].push(god);
    return acc;
  },
  {}
);

function lookupPantheon(value) {
  return PANTHEON_LIST[value] || GODS_LIST[value] || null;
}

module.exports = {
  lookupPantheon,
}