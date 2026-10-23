const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z.string().min(1),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string(),
  SESSION_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  CORS_ORIGINS: z.string().default(''),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid server configuration (${missing}). Copy .env.example to .env and fill in the required values.`);
}

module.exports = result.data;
