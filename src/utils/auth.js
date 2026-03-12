const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };