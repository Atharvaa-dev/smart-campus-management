async function persistAccount(pool, role, account, passwordHash) {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [userResult] = await connection.execute(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [account.email, passwordHash, role],
    );

    if (role === 'student') {
      await connection.execute(
        `INSERT INTO students (user_id, student_number, full_name, course, semester, phone)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userResult.insertId, account.studentNumber, account.name, account.course, account.semester, account.phone],
      );
    }

    await connection.commit();
    transactionStarted = false;
    return userResult.insertId;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original database error; the connection is still released below.
      }
    }

    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('That email address or student number is already in use.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { persistAccount };
