const express = require('express');
const { z } = require('zod');
const pool = require('./db');
const { requireAuth, requireRole } = require('./auth');
const { HttpError, validate } = require('./errors');

const router = express.Router();
const statusSchema = z.object({
  studentNumber: z.string().trim().min(1).max(32),
  status: z.enum(['pending', 'in_progress', 'submitted']),
});
const createSchema = z.object({
  subjectCode: z.string().trim().min(1).max(24),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(1).max(5000),
  dueAt: z.string().datetime({ local: true }),
});

router.get('/', requireAuth, async (req, res) => {
  // Students receive assignments for their exact course and semester; admins can inspect all.
  const studentId = req.user.role === 'student' ? req.user.student_id : null;
  if (req.user.role === 'student' && !studentId) {
    throw new HttpError(403, 'This account has no student profile.');
  }

  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.description, sub.code AS subjectCode, sub.name AS subject,
            DATE_FORMAT(a.due_at, '%Y-%m-%dT%H:%i:%s') AS dueAt,
            COALESCE(submission.status, 'pending') AS status
     FROM assignments a
     JOIN subjects sub ON sub.id = a.subject_id
     LEFT JOIN assignment_submissions submission
       ON submission.assignment_id = a.id AND submission.student_id = ?
     WHERE (? IS NULL OR (sub.course = ? AND sub.semester = ?))
     ORDER BY a.due_at ASC`,
    [studentId, studentId, req.user.course || '', req.user.semester || ''],
  );

  res.json({ data: rows.map((row) => ({
    ...row,
    status: row.status === 'in_progress' ? 'In progress' : row.status[0].toUpperCase() + row.status.slice(1),
  })) });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const input = validate(createSchema, req.body);
  const [result] = await pool.execute(
    `INSERT INTO assignments (subject_id, title, description, due_at)
     SELECT id, ?, ?, ? FROM subjects WHERE code = ? AND is_active = TRUE`,
    [input.title, input.description, input.dueAt.replace('T', ' '), input.subjectCode],
  );

  if (!result.affectedRows) {
    throw new HttpError(404, 'The subject code was not found.');
  }

  res.status(201).json({ data: { id: result.insertId, ...input } });
});

router.put('/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
  // Submission status is an administrative operation; the student assignment view is read-only.
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, 'Assignment ID must be a positive integer.');
  }
  const { studentNumber, status } = validate(statusSchema, req.body);
  const [existing] = await pool.execute(
    `SELECT a.id, student.id AS studentId
     FROM assignments a
     JOIN subjects sub ON sub.id = a.subject_id
     JOIN students student ON student.student_number = ?
       AND student.course = sub.course AND student.semester = sub.semester
     WHERE a.id = ?`,
    [studentNumber, id],
  );
  if (!existing.length) {
    throw new HttpError(404, 'Assignment not found.');
  }

  const [result] = await pool.execute(
    `INSERT INTO assignment_submissions (assignment_id, student_id, status, submitted_at)
     SELECT id, ?, ?, IF(? = 'submitted', UTC_TIMESTAMP(), NULL)
     FROM assignments WHERE id = ?
     ON DUPLICATE KEY UPDATE status = VALUES(status),
       submitted_at = IF(VALUES(status) = 'submitted', UTC_TIMESTAMP(), NULL)`,
    [existing[0].studentId, status, status, id],
  );

  res.json({ data: { id, studentNumber, status } });
});

module.exports = router;
