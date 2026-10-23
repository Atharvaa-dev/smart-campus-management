const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const pool = require('./db');
const config = require('./config');
const { notFound, errorHandler, HttpError } = require('./errors');
const { requireAuth, requireRole } = require('./auth');

const app = express();
const projectRoot = path.resolve(__dirname, '../..');

// Add common security headers and a request ID before handling any route.
app.disable('x-powered-by');
app.set('env', config.NODE_ENV);
app.set('trust proxy', config.TRUST_PROXY_HOPS);
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...config.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '32kb', strict: true }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const allowedOrigins = new Set(config.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));
// Cookie-authenticated API writes accept same-origin requests and explicitly configured frontend origins.
app.use('/api', (req, res, next) => {
  const requestOrigin = req.get('Origin');
  if (!requestOrigin) return next();

  let parsedOrigin;
  try {
    parsedOrigin = new URL(requestOrigin);
  } catch {
    return next(new HttpError(403, 'Request origin is not allowed.'));
  }

  const sameOrigin = parsedOrigin.host === req.get('host') && parsedOrigin.protocol === `${req.protocol}:`;
  if (!sameOrigin && !allowedOrigins.has(requestOrigin)) {
    return next(new HttpError(403, 'Request origin is not allowed.'));
  }

  res.set('Access-Control-Allow-Origin', requestOrigin);
  res.set('Access-Control-Allow-Credentials', 'true');
  res.vary('Origin');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.sendStatus(204);
  }

  return next();
});

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ data: { status: 'ok' } });
});

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
  skipSuccessfulRequests: true,
}), require('./routes/auth'));

// Each router owns a feature area; the router applies its own authentication and role rules.
app.use('/api/profile', require('./routes/profile'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/timetable', require('./routes/timetable'));
app.use('/api/events', require('./routes/events'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/admin', require('./routes/admin'));

const pageFiles = [
  '/index.html', '/login.html', '/attendance.html', '/assignments.html',
  '/timetable.html', '/events.html', '/announcements.html', '/profile.html', '/settings.html',
];
// Admin HTML is protected on the server; hiding its navigation link alone would not secure it.
app.get('/admin.html', requireAuth, requireRole('admin'), (req, res, next) => {
  res.sendFile(path.join(projectRoot, 'admin.html'), (error) => error && next(error));
});
app.get(['/', ...pageFiles], (req, res, next) => {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  res.sendFile(path.join(projectRoot, file), (error) => error && next(error));
});
app.use('/css', express.static(path.join(projectRoot, 'css'), { dotfiles: 'deny', maxAge: 0 }));
app.use('/js', express.static(path.join(projectRoot, 'js'), { dotfiles: 'deny', maxAge: 0 }));
// Serve local decorative assets from the same origin so the login art also works offline.
app.use('/assets', express.static(path.join(projectRoot, 'assets'), { dotfiles: 'deny', maxAge: 0 }));

app.use('/api', notFound);
app.use((req, res) => {
  res.status(404).send('Page not found.');
});
app.use(errorHandler);

module.exports = app;
