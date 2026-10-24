const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const cookie = require('cookie');
const { z } = require('zod');
const pool = require('./db');
const config = require('./config');
const { HttpError, validate } = require('./errors');

const router = express.Router();
const loginSchema = z.object({
  identity: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});
const dummyPasswordHash = bcrypt.hashSync('smart-campus-invalid-user', config.BCRYPT_ROUNDS);

function clearSessionCookie(res, secure = false) {
  res.clearCookie('smart-campus.sid', {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
  });
}

async function createSession(userId, res, secure = false) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex');
  await pool.execute(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))',
    [userId, tokenHash],
  );
  res.cookie('smart-campus.sid', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

async function requireAuth(req, res, next) {
  const token = cookie.parse(req.headers.cookie || '')['smart-campus.sid'];
  if (!token) {
    clearSessionCookie(res, config.NODE_ENV === 'production');
    return next(new HttpError(401, 'Authentication required.'));
  }

  const tokenHash = crypto.createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex');
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.role, u.is_active, s.id AS student_id, s.student_number, s.full_name, s.course, s.semester, s.phone
     FROM user_sessions us
     JOIN users u ON u.id = us.user_id
     LEFT JOIN students s ON s.user_id = u.id
     WHERE us.token_hash = ? AND us.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [tokenHash],
  );

  if (!rows.length) {
    clearSessionCookie(res, config.NODE_ENV === 'production');
    return next(new HttpError(401, 'Authentication required.'));
  }

  req.user = rows[0];
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new HttpError(401, 'Authentication required.'));
    }
    if (req.user.role !== role) {
      return next(new HttpError(403, 'You do not have permission to access this resource.'));
    }
    next();
  };
}

function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'student' || !req.user.student_id) {
    return next(new HttpError(403, 'This account has no student profile.'));
  }
  next();
}

router.post('/login', async (req, res) => {
  const { identity, password } = validate(loginSchema, req.body);
  const [users] = await pool.execute(
    `SELECT u.id, u.email, u.password_hash, u.role, u.is_active
     FROM users u
     LEFT JOIN students s ON s.user_id = u.id
     WHERE u.email = ? OR s.student_number = ?
     LIMIT 1`,
    [identity.toLowerCase(), identity],
  );
  const user = users[0];

  const passwordMatches = await bcrypt.compare(password, user?.password_hash || dummyPasswordHash);
  if (!user || !passwordMatches) {
    throw new HttpError(401, 'The student ID/email or password is incorrect.');
  }

  if (!user.is_active) {
    throw new HttpError(403, 'This account has been disabled. Contact a campus administrator.');
  }

  await pool.execute('DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP()');
  await createSession(user.id, res, config.NODE_ENV === 'production');
  res.json({ data: { id: user.id, email: user.email, role: user.role } });
});

router.post('/logout', async (req, res) => {
  const token = cookie.parse(req.headers.cookie || '')['smart-campus.sid'];

  if (token) {
    await pool.execute(
      'DELETE FROM user_sessions WHERE token_hash = ?',
      [crypto.createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex')],
    );
  }

  clearSessionCookie(res, config.NODE_ENV === 'production');
  res.json({ data: { success: true } });
});

router.get('/me', requireAuth, (req, res) => {
  const { id, email, role, student_id: studentId, student_number: studentNumber, full_name: name, course, semester, phone } = req.user;
  res.json({ data: { id, email, role, student: studentId ? { id: studentId, studentNumber, name, course, semester, phone } : null } });
});

module.exports = router;
module.exports.router = router;
module.exports.clearSessionCookie = clearSessionCookie;
module.exports.createSession = createSession;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
module.exports.requireStudent = requireStudent;
