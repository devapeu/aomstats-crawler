const { ADMIN_PASSWORD } = require('../config');

// Middleware to validate the fixed admin password sent as a bearer token
const validateAdminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];

  if (!adminKey || adminKey !== ADMIN_PASSWORD) {
    return res.status(401).json({
      code: 401,
      message: 'Unauthorized: Invalid or missing admin credentials'
    });
  }

  next();
};

module.exports = validateAdminAuth;
