const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const validateApiKey = require('../middleware/validateApiKey');
const { DISCORD_WEBHOOK_URL } = require('../config');

// Discord webhook endpoint
router.post('/send-planner-to-discord', validateApiKey, async (req, res) => {
  try {
    // Validate request body
    if (!req.body.imageBase64) {
      return res.status(400).json({
        code: 400,
        message: 'Missing required fields: imageBase64 and message'
      });
    }

    // Validate Discord webhook URL is configured
    if (!DISCORD_WEBHOOK_URL) {
      console.error('Discord webhook URL not configured');
      return res.status(500).json({
        code: 500,
        message: 'Discord webhook not configured on server'
      });
    }

    const { imageBase64, message = '' } = req.body;

    // Convert base64 to buffer
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(imageBase64, 'base64');
    } catch (err) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid base64 image data'
      });
    }

    const form = new FormData();
    form.append('file', imageBuffer, { filename: 'teams.png', contentType: 'image/png' });
    form.append('content', message);

    // Send to Discord 
    let discordRes;
    try {
      discordRes = await axios.post(DISCORD_WEBHOOK_URL, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 15000
      });
    } catch (err) {      
      const status = err.response?.status;
      const data = err.response?.data || err.message;
      console.error(`Discord webhook failed: ${status || 'ERR'} ${JSON.stringify(data)}`);
      return res.status(502).json({
        code: 502,
        message: `Discord webhook failed with status ${status || 'error'}`
      });
    }

    if (discordRes.status < 200 || discordRes.status >= 300) {
      console.error(`Discord webhook returned non-2xx: ${discordRes.status} ${JSON.stringify(discordRes.data)}`);
      return res.status(502).json({
        code: 502,
        message: `Discord webhook failed with status ${discordRes.status}`
      });
    }

    res.json({
      code: 200,
      message: 'Image sent to Discord successfully'
    });

  } catch (err) {
    console.error('Error sending to Discord:', err);
    res.status(500).json({
      code: 500,
      message: `Server error: ${err.message}`
    });
  }
});

module.exports = router;