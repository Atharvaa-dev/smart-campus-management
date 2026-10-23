const mysql = require('mysql2/promise');
const config = require('./config');

// Reuse a bounded MySQL connection pool so API requests do not open a new connection each time.
const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  database: config.MYSQL_DATABASE,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

module.exports = pool;
