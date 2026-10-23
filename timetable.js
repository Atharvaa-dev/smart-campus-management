const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const { requireAuth, requireRole, requireStudent } = require('../auth');
const { HttpError, validate } = require('../errors');

const router = express.Router();
const entrySchema = z.object({
  subjectCode: z.string().trim().min(1).max(24),
  dayOfWeek: z.number().int().min(1).max(5),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  room: z.string().trim().min(1).max(64),
  classType: z.string().trim().min(1).max(32).default('Lecture'),
}).refine((entry) => entry.endTime > entry.startTime, {
  message: 'End time must be after start time.',
  path: ['endTime'],
});

router.get('/', requireAuth, async (req, res) => {
  if (req.user.role === 'student' && !req.user.student_id) {
    throw new HttpError(403, 'This account has no student profile.');
  }

  const [rows] = await pool.execute(
    `SELECT t.id, sub.code AS subjectCode, sub.name AS subject,
            t.day_of_week AS dayOfWeek,
            TIME_FORMAT(t.start_time, '%H:%i') AS startTime,
            TIME_FORMAT(t.end_time, '%H:%i') AS endTime,
            t.room, t.class_type AS classType
     FROM timetable_entries t
     JOIN subjects sub ON sub.id = t.subject_id
     WHERE (? IS NULL OR (sub.course = ? AND sub.semester = ?))
     ORDER BY t.day_of_week, t.start_time`,
    [req.user.student_id || null, req.user.course || '', req.user.semester || ''],
  );

  res.json({ data: rows });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const entry = validate(entrySchema, req.body);
  const [result] = await pool.execute(
    `INSERT INTO timetable_entries (subject_id, day_of_week, start_time, end_time, room, class_type)
     SELECT id, ?, ?, ?, ?, ? FROM subjects WHERE code = ?`,
    [entry.dayOfWeek, entry.startTime, entry.endTime, entry.room, entry.classType, entry.subjectCode],
  );

  if (!result.affectedRows) {
    throw new HttpError(404, 'The subject code was not found.');
  }

  res.status(201).json({ data: { id: result.insertId, ...entry } });
});

module.exports = router;
