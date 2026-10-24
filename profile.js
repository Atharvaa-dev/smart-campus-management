const express = require('express');
const { z } = require('zod');
const pool = require('./db');
const { requireAuth, requireStudent } = require('./auth');
const { HttpError, validate } = require('./errors');

const router = express.Router();
const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  course: z.string().trim().min(2).max(120),
  semester: z.string().trim().min(2).max(40),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^[+0-9() -]{7,32}$/),
});

router.use(requireAuth, requireStudent);

router.get('/', (req, res) => {
  const { student_id: id, student_number: studentNumber, full_name: name, course, semester, phone, email } = req.user;
  res.json({ data: { id, studentNumber, name, course, semester, phone, email } });
});

router.patch('/', async (req, res) => {
  const profile = validate(profileSchema, req.body);
  if (profile.course !== req.user.course || profile.semester !== req.user.semester) {
    throw new HttpError(403, 'Course and semester can only be changed by campus administration.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE users SET email = ? WHERE id = ?',
      [profile.email.toLowerCase(), req.user.id],
    );
    await connection.execute(
      'UPDATE students SET full_name = ?, phone = ? WHERE id = ?',
      [profile.name, profile.phone, req.user.student_id],
    );
    await connection.commit();
    res.json({
      data: {
        ...profile,
        course: req.user.course,
        semester: req.user.semester,
        email: profile.email.toLowerCase(),
        studentNumber: req.user.student_number,
      },
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'That email address is already linked to an account.');
    }
    throw error;
  } finally {
    connection.release();
  }
});

module.exports = router;
