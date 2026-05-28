const { crawlFromAPI } = require('../services/aomstats');

async function fetchLatest () {
  await crawlFromAPI();
}

fetchLatest();