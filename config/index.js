const PORT = 3000;
const API_KEY = process.env.DISCORD_WEBHOOK_API_KEY || '1e7a2a92-83c2-43e0-b092-f63b39e33da0';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

module.exports = {
  PORT,
  API_KEY,
  DISCORD_WEBHOOK_URL,
};