const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('./errors');
const { persistAccount } = require('./account-persistence');

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function ask(prompt, label) {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error('Input ended before account creation was complete.'));
    prompt.once('close', onClose);

    prompt.question(label).then((answer) => {
      prompt.removeListener('close', onClose);
      resolve(answer);
    }, (error) => {
      prompt.removeListener('close', onClose);
      reject(error);
    });
  });
}

async function askMissing(prompt, question, current) {
  if (current !== undefined && current !== '') return current;
  return (await ask(prompt, `${question}: `)).trim();
}

function accountSchemaFor(role) {
  const commonFields = {
    email: z.string().trim().email().max(254),
    name: z.string().trim().min(2).max(120),
  };

  if (role === 'admin') return z.object(commonFields);

  return z.object({
    ...commonFields,
    studentNumber: z.string().trim().min(1).max(32),
    course: z.string().trim().min(2).max(120),
    semester: z.string().trim().min(2).max(40),
    phone: z.string().trim().regex(/^[+0-9() -]{7,32}$/),
  });
}

function safeErrorMessage(error) {
  const fieldErrors = error.details?.fieldErrors;
  if (fieldErrors) {
    const errors = Object.entries(fieldErrors)
      .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
      .join('; ');
    if (errors) return `Invalid account details: ${errors}`;
  }

  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'MySQL rejected the configured application credentials. Check MYSQL_USER and MYSQL_PASSWORD in .env.';
  }
  if (error.code === 'ER_BAD_DB_ERROR') {
    return 'The configured MySQL database does not exist. Initialize server/database/schema.sql first.';
  }
  if (error.code === 'ECONNREFUSED') {
    return 'Could not connect to MySQL. Check that the MySQL service is running and MYSQL_HOST/MYSQL_PORT are correct.';
  }
  if (error.code === 'ER_NO_SUCH_TABLE') {
    return 'A required Smart Campus table is missing. Initialize server/database/schema.sql first.';
  }
  if (error.code === 'ER_DUP_ENTRY') {
    return 'That email address or student number is already in use.';
  }
  if (error.code && /^[A-Z0-9_]{1,64}$/.test(error.code)) {
    return `Account creation failed because of a database error (${error.code}).`;
  }

  const safeMessages = new Set([
    'Role must be either admin or student.',
    'Choose a password with at least 12 characters.',
    'Choose a password no longer than 72 UTF-8 bytes.',
    'Input ended before account creation was complete.',
  ]);

  return safeMessages.has(error.message)
    ? error.message
    : 'Account creation failed because of an unexpected error. Check the application configuration and try again.';
}

async function main() {
  const pool = require('./db');
  const config = require('./config');
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  const role = option('role') || 'student';

  try {
    if (!['admin', 'student'].includes(role)) {
      throw new Error('Role must be either admin or student.');
    }

    const email = await askMissing(prompt, 'Email address', option('email'));
    const name = await askMissing(prompt, 'Full name', option('name'));
    const account = { email: email.toLowerCase(), name };

    if (role === 'student') {
      account.studentNumber = await askMissing(prompt, 'Student number', option('student-number'));
      account.course = await askMissing(prompt, 'Course', option('course'));
      account.semester = await askMissing(prompt, 'Semester', option('semester'));
      account.phone = await askMissing(prompt, 'Phone number', option('phone'));
    }

    const input = validate(accountSchemaFor(role), account);
    stdout.write('Password input is visible in this terminal. Choose at least 12 characters.\n');
    const password = await ask(prompt, 'Password: ');

    if (password.length < 12) {
      throw new Error('Choose a password with at least 12 characters.');
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('Choose a password no longer than 72 UTF-8 bytes.');
    }

    const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    await persistAccount(pool, role, input, passwordHash);
    console.log(`${role === 'admin' ? 'Admin' : 'Student'} account created for ${input.email}.`);
  } finally {
    prompt.close();
    stdin.pause();
    stdin.destroy();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(safeErrorMessage(error));
    if (error.code && /^[A-Z0-9_]{1,64}$/.test(error.code)) {
      console.error(`Database error code: ${error.code}`);
    }
    process.exitCode = 1;
  });
}

module.exports = { accountSchemaFor, persistAccount, safeErrorMessage };
