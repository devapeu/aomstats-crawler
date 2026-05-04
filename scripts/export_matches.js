const fs = require('fs');
const { exportAsCSV } = require('../services/export_csv');

const result = exportAsCSV();

fs.writeFileSync('matches.csv', result, 'utf-8');
