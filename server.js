const app = require('./app');
const pool = require('./db');
const config = require('./config');

const server = app.listen(config.PORT, () => {
  console.log(`Smart Campus is listening on http://localhost:${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down Smart Campus.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
