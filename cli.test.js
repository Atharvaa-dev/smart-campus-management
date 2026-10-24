const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { test } = require('node:test');
const { accountSchemaFor, safeErrorMessage } = require('./create-account');
const { validate } = require('./errors');
const { persistAccount } = require('./account-persistence');

const studentAccount = {
  email: 'new.student@example.test',
  name: 'New Student',
  studentNumber: 'STU-TEST-009',
  course: 'B.Tech Computer Science',
  semester: 'Semester 1',
  phone: '+91 90000 00000',
};

test('validates student account fields and normalizes whitespace', () => {
  const result = accountSchemaFor('student').safeParse({
    ...studentAccount,
    name: '  New Student  ',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, 'New Student');
  assert.equal(accountSchemaFor('student').safeParse({ ...studentAccount, phone: 'bad' }).success, false);
  assert.equal(accountSchemaFor('student').safeParse({ ...studentAccount, studentNumber: '' }).success, false);
});

test('shows specific validation messages without echoing submitted values', () => {
  let validationError;
  try {
    validate(accountSchemaFor('student'), { ...studentAccount, email: 'private-invalid-value' });
  } catch (error) {
    validationError = error;
  }

  const message = safeErrorMessage(validationError);
  assert.match(message, /Invalid account details: email:/);
  assert.doesNotMatch(message, /private-invalid-value/);
});

test('creates a hashed user and linked student in one transaction', async () => {
  const calls = [];
  const passwordHash = await bcrypt.hash('a-strong-test-password', 10);
  const fakeConnection = {
    async beginTransaction() { calls.push(['begin']); },
    async execute(sql, params) {
      calls.push([sql, params]);
      return sql.includes('INSERT INTO users') ? [{ insertId: 42 }] : [{ affectedRows: 1 }];
    },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    release() { calls.push(['release']); },
  };
  const fakePool = { async getConnection() { return fakeConnection; } };

  const userId = await persistAccount(fakePool, 'student', studentAccount, passwordHash);
  assert.equal(userId, 42);
  assert.equal(await bcrypt.compare('a-strong-test-password', calls[1][1][1]), true);
  assert.equal(calls[2][0].includes('INSERT INTO students'), true);
  assert.equal(calls[2][1][0], 42);
  assert.deepEqual(calls.map((call) => call[0]), ['begin', calls[1][0], calls[2][0], 'commit', 'release']);
});

test('rolls back the user insert when student creation fails', async () => {
  const calls = [];
  const fakeConnection = {
    async beginTransaction() { calls.push('begin'); },
    async execute(sql) {
      calls.push(sql);
      if (sql.includes('INSERT INTO students')) throw new Error('student insert failed');
      return [{ insertId: 42 }];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
  const fakePool = { async getConnection() { return fakeConnection; } };

  await assert.rejects(persistAccount(fakePool, 'student', studentAccount, 'bcrypt-hash'), /student insert failed/);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
  assert.equal(calls.includes('commit'), false);
});

test('reports database failures without printing raw driver details', () => {
  const error = Object.assign(new Error('password=do-not-print'), { code: 'ER_ACCESS_DENIED_ERROR' });
  const message = safeErrorMessage(error);

  assert.match(message, /MYSQL_USER and MYSQL_PASSWORD/);
  assert.doesNotMatch(message, /do-not-print/);
});
