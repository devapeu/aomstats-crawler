const GOD_TO_PANTHEON = {
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

const PANTHEON_TO_GODS = Object.entries(GOD_TO_PANTHEON).reduce(
  (acc, [god, pantheon]) => {
    if (!acc[pantheon]) acc[pantheon] = [];
    acc[pantheon].push(god);
    return acc;
  },
  {}
);

module.exports = {
  GOD_TO_PANTHEON,
  PANTHEON_TO_GODS,
}