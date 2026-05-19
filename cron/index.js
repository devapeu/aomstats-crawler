const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
import { crawlFromAPI } from '../services/aomstats';

// Database backup cron job - runs weekly on Sunday at 9:30 AM (Server Time)
cron.schedule('30 9 * * 0', () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupDir = path.join(__dirname, '..', 'backups');

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `db-backup-${timestamp}.sqlite`);
    const dbPath = path.join(__dirname, '..', 'db.sqlite');

    // Copy the database file
    fs.copyFileSync(dbPath, backupPath);

    console.log(`Database backup created: ${backupPath}`);

    // Clean up old backups (keep last 7 weeks)
    cleanupOldBackups(backupDir);

  } catch (err) {
    console.error('Error in database backup cron job:', err);
    fs.appendFileSync('cron_errors.log', `[${new Date().toISOString()}] Database backup error: ${err.stack || err}\n`);
  }
});

// Function to clean up old backup files
function cleanupOldBackups(backupDir) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('db-backup-') && file.endsWith('.sqlite'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        timestamp: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first

    // Keep only the most recent 7 backups
    if (files.length > 7) {
      const filesToDelete = files.slice(7);
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`Deleted old backup: ${file.name}`);
      });
    }
  } catch (err) {
    console.error('Error cleaning up old backups:', err);
  }
}

cron.schedule('0 9 * * *', async () => { // runs at 5 am EST
  try {
    await crawlFromAPI();
  } catch (err) {
    console.error('Error in cron job:', err);
    fs.appendFileSync('cron_errors.log', `[${new Date().toISOString()}] ${err.stack || err}\n`);
  }
});

module.exports = {};