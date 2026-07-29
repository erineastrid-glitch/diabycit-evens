const crypto = require('crypto');
const { db } = require('./db');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date().toISOString());
  return token;
}

function getUserFromToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  return user || null;
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function log(userId, action, cible) {
  db.prepare('INSERT INTO journal_activite (utilisateur_id, action, cible, date) VALUES (?, ?, ?, ?)')
    .run(userId || null, action, cible || null, new Date().toISOString());
}

module.exports = { hashPassword, verifyPassword, createSession, getUserFromToken, destroySession, log };
