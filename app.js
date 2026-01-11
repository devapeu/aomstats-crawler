const express = require('express');
const app = express();
const cors = require('cors');
const { PORT } = require('./config');

require('./cron'); // Start the cron job

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Routes
app.use('/', require('./routes/players'));
app.use('/', require('./routes/discord'));
app.use('/', require('./routes/matchup'));
app.use('/', require('./routes/stats'));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});