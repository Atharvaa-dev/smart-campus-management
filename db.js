
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  database: config.MYSQL_DATABASE,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,

  // Aiven requires encrypted MySQL connections.
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },

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
