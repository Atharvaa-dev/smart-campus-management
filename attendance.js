const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const { requireAuth, requireRole, requireStudent } = require('../auth');
const { HttpError, validate } = require('../errors');

const router = express.Router();
const recordSchema = z.object({
  studentNumber: z.string().trim().min(1).max(32),
  subjectCode: z.string().trim().min(1).max(24),
  classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid calendar date.'),
  attended: z.boolean(),
});

router.get('/', requireAuth, requireStudent, async (req, res) => {
  // LEFT JOIN keeps active course subjects visible even when a student has no attendance yet.
  // Filtering by the linked student ID and profile course/semester keeps each dashboard isolated.
  const [subjects] = await pool.execute(
    `SELECT sub.id, sub.code, sub.name,
            COUNT(ar.id) AS totalClasses,
            COALESCE(SUM(CASE WHEN ar.attended = 1 THEN 1 ELSE 0 END), 0) AS attendedClasses
     FROM subjects sub
     LEFT JOIN attendance_records ar ON ar.subject_id = sub.id AND ar.student_id = ?
     WHERE sub.course = ? AND sub.semester = ? AND sub.is_active = TRUE
     GROUP BY sub.id, sub.code, sub.name
     ORDER BY sub.name`,
    [req.user.student_id, req.user.course, req.user.semester],
  );

  const totals = subjects.reduce((result, subject) => ({
    attendedClasses: result.attendedClasses + Number(subject.attendedClasses),
    totalClasses: result.totalClasses + Number(subject.totalClasses),
  }), { attendedClasses: 0, totalClasses: 0 });

  // Count present records over all records; return zero safely when there are no classes.
  res.json({
    data: {
      ...totals,
      attendancePercent: totals.totalClasses
        ? Math.round((totals.attendedClasses / totals.totalClasses) * 100)
        : 0,
      subjects: subjects.map((subject) => {
        const totalClasses = Number(subject.totalClasses);
        const attendedClasses = Number(subject.attendedClasses);
        return {
          id: subject.id,
          code: subject.code,
          name: subject.name,
          totalClasses,
          attendedClasses,
          attendancePercent: totalClasses ? Math.round((attendedClasses / totalClasses) * 100) : 0,
        };
      }),
    },
  });
});

router.post('/records', requireAuth, requireRole('admin'), async (req, res) => {
  const input = validate(recordSchema, req.body);
  const [records] = await pool.execute(
    `SELECT student.id AS studentId, subject.id AS subjectId
     FROM students student
     JOIN subjects subject ON subject.code = ? AND subject.is_active = TRUE
       AND subject.course = student.course AND subject.semester = student.semester
     WHERE student.student_number = ?`,
    [input.subjectCode, input.studentNumber],
  );
  if (!records.length) {
    throw new HttpError(404, 'The student number or subject code was not found.');
  }

  // The schema's student/subject/date unique key makes repeat saves update the existing class.
  await pool.execute(
    `INSERT INTO attendance_records (student_id, subject_id, class_date, attended)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE attended = VALUES(attended)`,
    [records[0].studentId, records[0].subjectId, input.classDate, input.attended],
  );

  res.status(201).json({ data: { success: true } });
});

module.exports = router;
