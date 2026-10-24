
const mysql = require('mysql2/promise');
const config = require('./config');

const ca = process.env.MYSQL_SSL_CA;

const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  database: config.MYSQL_DATABASE,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,

  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
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
