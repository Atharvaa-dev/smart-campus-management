const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const { requireAuth, requireRole, requireStudent } = require('../auth');
const { HttpError, validate } = require('../errors');

const router = express.Router();
const eventSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(1).max(5000),
  eventType: z.string().trim().min(2).max(48),
  startsAt: z.string().datetime(),
  location: z.string().trim().min(2).max(180),
});

router.get('/', requireAuth, async (req, res) => {
  if (req.user.role === 'student' && !req.user.student_id) {
    throw new HttpError(403, 'This account has no student profile.');
  }

  const studentId = req.user.role === 'student' ? req.user.student_id : null;
  const [rows] = await pool.execute(
    `SELECT e.id, e.title, e.description, e.event_type AS eventType,
            DATE_FORMAT(e.starts_at, '%Y-%m-%dT%H:%i:%s') AS startsAt,
            e.location,
            IF(r.id IS NULL, FALSE, TRUE) AS registered
     FROM campus_events e
     LEFT JOIN event_registrations r ON r.event_id = e.id AND r.student_id = ?
     WHERE e.is_published = TRUE AND e.starts_at >= CURDATE()
     ORDER BY e.starts_at`,
    [studentId],
  );
  res.json({ data: rows.map((row) => ({ ...row, registered: Boolean(row.registered) })) });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const event = validate(eventSchema, req.body);
  const [result] = await pool.execute(
    'INSERT INTO campus_events (title, description, event_type, starts_at, location) VALUES (?, ?, ?, ?, ?)',
    [event.title, event.description, event.eventType, new Date(event.startsAt), event.location],
  );
  res.status(201).json({ data: { id: result.insertId, ...event } });
});

router.post('/:id/registration', requireAuth, requireStudent, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    throw new HttpError(400, 'Event ID must be a positive integer.');
  }

  const [events] = await pool.execute(
    'SELECT id FROM campus_events WHERE id = ? AND is_published = TRUE AND starts_at >= CURDATE()',
    [eventId],
  );
  if (!events.length) {
    throw new HttpError(404, 'Upcoming event not found.');
  }

  await pool.execute(
    `INSERT INTO event_registrations (event_id, student_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE registered_at = CURRENT_TIMESTAMP`,
    [eventId, req.user.student_id],
  );

  res.status(201).json({ data: { eventId, registered: true } });
});

router.delete('/:id/registration', requireAuth, requireStudent, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    throw new HttpError(400, 'Event ID must be a positive integer.');
  }
  await pool.execute(
    'DELETE FROM event_registrations WHERE event_id = ? AND student_id = ?',
    [eventId, req.user.student_id],
  );
  res.json({ data: { eventId, registered: false } });
});

module.exports = router;
