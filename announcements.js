const express = require('express');
const { z } = require('zod');
const pool = require('./db');
const { requireAuth, requireRole, requireStudent } = require('./auth');
const { HttpError, validate } = require('./errors');

const router = express.Router();
const announcementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(1).max(10000),
  category: z.string().trim().min(2).max(48),
});

router.get('/', requireAuth, async (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.student_id : null;
  if (req.user.role === 'student' && !studentId) {
    throw new HttpError(403, 'This account has no student profile.');
  }

  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.body, a.category,
            DATE_FORMAT(a.published_at, '%b %d, %Y') AS publishedAt,
            IF(read_status.id IS NULL, FALSE, TRUE) AS isRead
     FROM announcements a
     LEFT JOIN announcement_reads read_status
       ON read_status.announcement_id = a.id AND read_status.student_id = ?
     WHERE a.is_published = TRUE
     ORDER BY a.published_at DESC`,
    [studentId],
  );
  res.json({ data: rows.map((row) => ({ ...row, isRead: Boolean(row.isRead) })) });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const announcement = validate(announcementSchema, req.body);
  const [result] = await pool.execute(
    'INSERT INTO announcements (title, body, category) VALUES (?, ?, ?)',
    [announcement.title, announcement.body, announcement.category],
  );
  res.status(201).json({ data: { id: result.insertId, ...announcement } });
});

router.put('/:id/read', requireAuth, requireStudent, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, 'Announcement ID must be a positive integer.');
  }
  const [announcements] = await pool.execute(
    'SELECT id FROM announcements WHERE id = ? AND is_published = TRUE',
    [id],
  );
  if (!announcements.length) {
    throw new HttpError(404, 'Announcement not found.');
  }

  await pool.execute(
    `INSERT INTO announcement_reads (announcement_id, student_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    [id, req.user.student_id],
  );
  res.json({ data: { id, isRead: true } });
});

router.delete('/:id/read', requireAuth, requireStudent, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, 'Announcement ID must be a positive integer.');
  }
  await pool.execute(
    'DELETE FROM announcement_reads WHERE announcement_id = ? AND student_id = ?',
    [id, req.user.student_id],
  );
  res.json({ data: { id, isRead: false } });
});

module.exports = router;
