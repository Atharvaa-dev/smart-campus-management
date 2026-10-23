const express = require('express');
const bcrypt = require('bcryptjs');
const { createHmac } = require('node:crypto');
const cookie = require('cookie');
const { z } = require('zod');
const pool = require('../db');
const config = require('../config');
const { HttpError, validate } = require('../errors');
const { clearSessionCookie, createSession, requireAuth } = require('../auth');

const router = express.Router();
const loginSchema = z.object({
  identity: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});
const dummyPasswordHash = bcrypt.hashSync('smart-campus-invalid-user', config.BCRYPT_ROUNDS);

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
      [createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex')],
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
