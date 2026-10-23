const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { validate } = require('../errors');

const router = express.Router();
const searchSchema = z.object({ search: z.string().trim().max(100).default('') });
const subjectFilterSchema = z.object({
  course: z.string().trim().min(1).max(120).optional(),
  semester: z.string().trim().min(1).max(40).optional(),
}).refine(({ course, semester }) => Boolean(course) === Boolean(semester), 'Course and semester must be provided together.');

// Protect every endpoint in this router, including future routes added below.
router.use(requireAuth, requireRole('admin'));

router.get('/overview', async (_req, res) => {
  const [studentRows, subjectRows, eventRows] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS count FROM students'),
    pool.execute('SELECT COUNT(*) AS count FROM subjects WHERE is_active = TRUE'),
    pool.execute(
      `SELECT id, title, event_type AS eventType,
              DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s') AS startsAt, location
       FROM campus_events
       WHERE is_published = TRUE AND starts_at >= UTC_TIMESTAMP()
       ORDER BY starts_at ASC LIMIT 5`,
    ),
  ]);

  res.json({ data: {
    studentCount: Number(studentRows[0][0].count),
    subjectCount: Number(subjectRows[0][0].count),
    upcomingEvents: eventRows[0],
  } });
});

router.get('/students', async (req, res) => {
  const { search } = validate(searchSchema, req.query);
  const pattern = `%${search}%`;
  const [rows] = await pool.execute(
    `SELECT s.id, s.student_number AS studentNumber, s.full_name AS name,
            s.course, s.semester, s.phone, u.email,
            COUNT(ar.id) AS totalClasses,
            COALESCE(SUM(ar.attended = TRUE), 0) AS attendedClasses
     FROM students s
     JOIN users u ON u.id = s.user_id AND u.is_active = TRUE
     LEFT JOIN attendance_records ar ON ar.student_id = s.id
     WHERE (? = '' OR s.student_number LIKE ? OR s.full_name LIKE ? OR u.email LIKE ?
            OR s.course LIKE ? OR s.semester LIKE ?)
     GROUP BY s.id, s.student_number, s.full_name, s.course, s.semester, s.phone, u.email
     ORDER BY s.full_name LIMIT 100`,
    [search, pattern, pattern, pattern, pattern, pattern],
  );
  res.json({ data: rows.map((row) => {
    const totalClasses = Number(row.totalClasses);
    const attendedClasses = Number(row.attendedClasses);
    return {
      ...row,
      totalClasses,
      attendedClasses,
      attendancePercent: totalClasses ? Math.round(attendedClasses / totalClasses * 100) : 0,
    };
  }) });
});

router.get('/subjects', async (req, res) => {
  const { course, semester } = validate(subjectFilterSchema, req.query);
  const scoped = Boolean(course && semester);
  const [rows] = await pool.execute(
    `SELECT id, code, name, course, semester
     FROM subjects WHERE is_active = TRUE
       AND (? = FALSE OR (course = ? AND semester = ?))
     ORDER BY course, semester, name`,
    [scoped, course || '', semester || ''],
  );
  res.json({ data: rows });
});

module.exports = router;
