const fs = require('fs');

const inputPath = './all_matches.json';
const outputPath = './all_matches_custom.json';

fs.readFile(inputPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }

  let json;
  try {
    json = JSON.parse(data);
  } catch (parseErr) {
    console.error('Invalid JSON:', parseErr);
    return;
  }

  if (!Array.isArray(json)) {
    console.error('Expected JSON to be an array');
    return;
  }

  const filtered = json.filter(x => x.description !== 'AUTOMATCH');

  fs.writeFile(outputPath, JSON.stringify(filtered, null, 2), err => {
    if (err) {
      console.error('Error writing file:', err);
      return;
    }
    console.log(`Filtered data saved to ${outputPath}`);
  });
});
