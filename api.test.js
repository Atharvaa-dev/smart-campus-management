const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'smart_campus_test';
process.env.MYSQL_USER = 'test_user';
process.env.MYSQL_PASSWORD = 'test_password';
process.env.SESSION_SECRET = 'test-only-session-secret-that-is-at-least-32-bytes';
process.env.BCRYPT_ROUNDS = '10';
process.env.CORS_ORIGINS = 'http://localhost:5500';

const testPasswordHash = bcrypt.hashSync('correct-password-123', 10);
const sessions = new Map();
const submissionStatuses = new Map();
const eventRegistrations = new Set();
const announcementReads = new Set();
const attendanceWrites = [];
let databaseFailure = null;
const profile = {
  id: 8,
  studentNumber: 'STU-TEST-001',
  name: 'Test Student',
  course: 'B.Tech Computer Science',
  semester: 'Semester 4',
  phone: '+91 90000 00000',
  email: 'student@example.test',
};

const studentUser = {
  id: 2,
  email: profile.email,
  role: 'student',
  student_id: profile.id,
  student_number: profile.studentNumber,
  full_name: profile.name,
  course: profile.course,
  semester: profile.semester,
  phone: profile.phone,
};

const secondProfile = {
  id: 9,
  studentNumber: 'STU-TEST-002',
  name: 'Second Student',
  course: 'B.Sc Mathematics',
  semester: 'Semester 2',
  phone: '+91 90000 00001',
  email: 'second.student@example.test',
};

const secondStudentUser = {
  id: 3,
  email: secondProfile.email,
  role: 'student',
  student_id: secondProfile.id,
  student_number: secondProfile.studentNumber,
  full_name: secondProfile.name,
  course: secondProfile.course,
  semester: secondProfile.semester,
  phone: secondProfile.phone,
};

const attendanceSubjects = [
  { id: 1, code: 'CS204', name: 'Data Structures', course: profile.course, semester: profile.semester },
  { id: 2, code: 'MA202', name: 'Linear Algebra', course: secondProfile.course, semester: secondProfile.semester },
  { id: 3, code: 'IT204', name: 'Web Application Development', course: 'B.Sc IT', semester: 'Semester 4' },
];
const attendanceRecords = [
  ...Array.from({ length: 10 }, (_, index) => ({ student_id: profile.id, subject_id: 1, attended: index < 9 })),
  ...Array.from({ length: 8 }, (_, index) => ({ student_id: secondProfile.id, subject_id: 2, attended: index < 4 })),
];

const adminUser = {
  id: 1,
  email: 'admin@example.test',
  role: 'admin',
  student_id: null,
  student_number: null,
  full_name: null,
  course: null,
  semester: null,
  phone: null,
};

const fakePool = {
  async query() {
    return [[{ ok: 1 }]];
  },

  async execute(sql, params = []) {
    if (databaseFailure) throw databaseFailure;

    if (sql.includes('FROM users u') && sql.includes('LEFT JOIN students')) {
      const identity = params[0];
      if (identity === studentUser.email || params[1] === studentUser.student_number) {
        return [[{ ...studentUser, password_hash: testPasswordHash, is_active: 1 }]];
      }
      if (identity === secondStudentUser.email || params[1] === secondStudentUser.student_number) {
        return [[{ ...secondStudentUser, password_hash: testPasswordHash, is_active: 1 }]];
      }
      if (identity === adminUser.email) {
        return [[{ ...adminUser, password_hash: testPasswordHash, is_active: 1 }]];
      }
      return [[]];
    }

    if (sql.includes('INSERT INTO user_sessions')) {
      sessions.set(params[0], params[1]);
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('FROM user_sessions session')) {
      const userId = sessions.get(params[0]);
      if (userId === studentUser.id) return [[studentUser]];
      if (userId === secondStudentUser.id) return [[secondStudentUser]];
      if (userId === adminUser.id) return [[adminUser]];
      return [[]];
    }

    if (sql === 'SELECT COUNT(*) AS count FROM students') return [[{ count: 2 }]];
    if (sql.includes('SELECT COUNT(*) AS count FROM subjects')) return [[{ count: 4 }]];
    if (sql.includes('FROM campus_events') && sql.includes('LIMIT 5')) return [[{ id: 1, title: 'TechNova', eventType: 'Technology', startsAt: '2026-10-29T10:00:00', location: 'Auditorium' }]];
    if (sql.includes('FROM students s') && sql.includes('GROUP BY s.id')) {
      return [[{ id: profile.id, studentNumber: profile.studentNumber, name: profile.name, course: profile.course, semester: profile.semester, phone: profile.phone, email: profile.email, totalClasses: 10, attendedClasses: 9, attendancePercent: 90 }]];
    }
    if (sql.includes('FROM subjects WHERE is_active = TRUE')) {
      const [, course, semester] = params;
      const rows = attendanceSubjects.filter((subject) => !params[0] || (subject.course === course && subject.semester === semester));
      return [rows];
    }

    if (sql.includes('FROM subjects sub')) {
      const [studentId, course, semester] = params;
      const rows = attendanceSubjects
        .filter((subject) => subject.course === course && subject.semester === semester)
        .map((subject) => {
          const records = attendanceRecords.filter((record) => record.student_id === studentId && record.subject_id === subject.id);
          return {
            ...subject,
            totalClasses: records.length,
            attendedClasses: records.filter((record) => record.attended === true).length,
          };
        });
      return [rows];
    }

    if (sql.includes('FROM assignments a') && sql.includes('WHERE a.id = ?')) {
      const [studentNumber, assignmentId] = params;
      const allowed = (assignmentId === 1 && studentNumber === profile.studentNumber)
        || (assignmentId === 2 && studentNumber === secondProfile.studentNumber);
      const student = studentNumber === secondProfile.studentNumber ? secondProfile : profile;
      return [allowed ? [{ id: assignmentId, studentId: student.id }] : []];
    }

    if (sql.includes('FROM assignments a')) {
      const studentId = params[0];
      if (studentId === secondProfile.id) {
        return [[{
          id: 2, title: 'Linear Algebra', description: 'Solve matrix exercises', subjectCode: 'MA202',
          subject: 'Linear Algebra', dueAt: '2026-10-24T23:59:00',
          status: submissionStatuses.get(`${studentId}:2`) || 'pending',
        }]];
      }
      return [[{
        id: 1, title: 'Trees', description: 'Build a tree', subjectCode: 'CS204',
        subject: 'Data Structures', dueAt: '2026-10-24T23:59:00',
        status: submissionStatuses.get(`${studentId}:1`) || 'pending',
      }]];
    }

    if (sql.includes('FROM timetable_entries t')) {
      if (params[0] === secondProfile.id) {
        return [[{ id: 2, subjectCode: 'MA202', subject: 'Linear Algebra', dayOfWeek: 2, startTime: '11:00', endTime: '12:00', room: 'D-202', classType: 'Lecture' }]];
      }
      return [[{ id: 1, subjectCode: 'CS204', subject: 'Data Structures', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', room: 'A-204', classType: 'Lecture' }]];
    }

    if (sql.includes('FROM campus_events e')) {
      const studentId = params[0];
      return [[{ id: 1, title: 'TechNova', description: 'Campus demos', eventType: 'Technology', startsAt: '2026-10-29T10:00:00', location: 'Auditorium', registered: eventRegistrations.has(`${studentId}:1`) }]];
    }
    if (sql.startsWith('SELECT id FROM campus_events')) return [[{ id: 1 }]];

    if (sql.includes('FROM announcements a')) {
      const studentId = params[0];
      return [[{ id: 1, title: 'Exam schedule', body: 'Schedule published', category: 'Academic', publishedAt: 'Oct 21, 2026', isRead: announcementReads.has(`${studentId}:1`) ? 1 : 0 }]];
    }
    if (sql.startsWith('SELECT id FROM announcements')) return [[{ id: 1 }]];

    if (sql.includes('FROM students student') && sql.includes('JOIN subjects subject')) {
      const student = params[1] === secondProfile.studentNumber ? secondProfile : profile;
      if ((params[0] === 'MA202' && student.id !== secondProfile.id)
        || (params[0] === 'CS204' && student.id !== profile.id)) return [[]];
      return [[{ studentId: student.id, subjectId: student.id === secondProfile.id ? 2 : 1 }]];
    }
    if (sql.includes('INSERT INTO assignment_submissions')) {
      submissionStatuses.set(`${params[0]}:${params[3]}`, params[1]);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO attendance_records')) { attendanceWrites.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.includes('INSERT INTO assignments')) return [{ affectedRows: 1, insertId: 47 }];
    if (sql.includes('INSERT INTO timetable_entries')) return [{ affectedRows: 1, insertId: 48 }];
    if (sql.includes('INSERT INTO event_registrations')) {
      eventRegistrations.add(`${params[1]}:${params[0]}`);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM event_registrations')) {
      eventRegistrations.delete(`${params[1]}:${params[0]}`);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO announcement_reads')) {
      announcementReads.add(`${params[1]}:${params[0]}`);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM announcement_reads')) {
      announcementReads.delete(`${params[1]}:${params[0]}`);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO campus_events')) return [{ affectedRows: 1, insertId: 45 }];
    if (sql.includes('INSERT INTO announcements')) return [{ affectedRows: 1, insertId: 46 }];

    return [{ affectedRows: 1, insertId: 3 }];
  },

  async getConnection() {
    return {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
      async execute(sql, params) {
        if (sql.startsWith('UPDATE users')) {
          const account = params[1] === secondStudentUser.id ? secondProfile : profile;
          account.email = params[0];
        }
        if (sql.startsWith('UPDATE students')) {
          const student = params[2] === secondProfile.id ? secondProfile : profile;
          [student.name, student.phone] = params;
        }
        return [{ affectedRows: 1 }];
      },
    };
  },
};

const databaseModule = require.resolve('./db');
require.cache[databaseModule] = {
  id: databaseModule,
  filename: databaseModule,
  loaded: true,
  exports: fakePool,
  children: [],
  paths: [],
};

const app = require('./app');
let server;
let baseUrl;
let studentCookie;
let adminCookie;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path, options = {}, cookieHeader) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...options.headers,
    },
  });
}

async function signIn(identity) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identity, password: 'correct-password-123' }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('serves existing frontend pages but does not expose server source', async () => {
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /data-page="dashboard"/);

  const css = await request('/css/style.css');
  assert.equal(css.status, 200);
  const appScript = await request('/js/app.js');
  assert.equal(appScript.status, 200);
  const configScript = await request('/js/config.js');
  assert.equal(configScript.status, 200);
  const loginIllustration = await request('/assets/images/campus-login.svg');
  assert.equal(loginIllustration.status, 200);
  assert.match(await loginIllustration.text(), /<svg[\s>]/);

  const privateSource = await request('/server/src/config.js');
  assert.equal(privateSource.status, 404);

  const protectedAdminPage = await request('/admin.html');
  assert.equal(protectedAdminPage.status, 401);
});

test('rejects malformed login bodies and bad passwords', async () => {
  const invalidBody = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(invalidBody.status, 400);

  const invalidPassword = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identity: studentUser.email, password: 'wrong-password' }),
  });
  assert.equal(invalidPassword.status, 401);
});

test('logs safe database error metadata and returns a generic 500 for login failures', async () => {
  const originalConsoleError = console.error;
  let logOutput = '';
  databaseFailure = Object.assign(new Error('driver detail contains do-not-log-this-secret'), {
    code: 'ER_ACCESS_DENIED_ERROR',
    sql: 'SELECT private details',
  });
  console.error = (message) => { logOutput += String(message); };

  try {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identity: studentUser.email, password: 'a-valid-length-password' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error, 'An unexpected server error occurred.');
    assert.ok(payload.requestId);
    assert.equal(response.headers.get('x-request-id'), payload.requestId);
    assert.match(logOutput, /ER_ACCESS_DENIED_ERROR/);
    assert.doesNotMatch(logOutput, /do-not-log-this-secret|private details/);
  } finally {
    databaseFailure = null;
    console.error = originalConsoleError;
  }
});

test('returns 401 for an anonymous session lookup and permits configured frontend origins', async () => {
  const anonymous = await request('/api/auth/me');
  assert.equal(anonymous.status, 401);

  const cors = await request('/api/auth/me', { headers: { Origin: 'http://localhost:5500' } });
  assert.equal(cors.status, 401);
  assert.equal(cors.headers.get('access-control-allow-origin'), 'http://localhost:5500');
  assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');

  const preflight = await request('/api/profile', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5500', 'Access-Control-Request-Method': 'PATCH' },
  });
  assert.equal(preflight.status, 204);
});

test('authenticates a student with an HTTP-only session and returns private data', async () => {
  studentCookie = await signIn(studentUser.email);
  assert.match(studentCookie, /^smart-campus\.sid=/);
  const loginResponse = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ identity: studentUser.email, password: 'correct-password-123' }),
  });
  assert.match(loginResponse.headers.get('set-cookie'), /HttpOnly/);
  assert.match(loginResponse.headers.get('set-cookie'), /SameSite=Lax/);

  const meResponse = await request('/api/auth/me', {}, studentCookie);
  assert.equal(meResponse.status, 200);
  assert.equal((await meResponse.json()).data.role, 'student');

  const responseBodies = {};
  for (const route of ['/api/profile', '/api/attendance', '/api/assignments', '/api/timetable', '/api/events', '/api/announcements']) {
    const response = await request(route, {}, studentCookie);
    assert.equal(response.status, 200, `${route} should be available to a student`);
    responseBodies[route] = (await response.json()).data;
  }

  assert.equal(responseBodies['/api/attendance'].attendancePercent, 90);
  assert.equal(responseBodies['/api/attendance'].subjects[0].totalClasses, 10);
  assert.equal(responseBodies['/api/assignments'][0].status, 'Pending');
  assert.equal(responseBodies['/api/timetable'][0].subject, 'Data Structures');
  assert.equal(responseBodies['/api/events'][0].registered, false);
  assert.equal(responseBodies['/api/announcements'][0].isRead, false);
});

test('calculates attendance from present and absent database records', async () => {
  const attendance = (await (await request('/api/attendance', {}, studentCookie)).json()).data;
  assert.equal(attendance.attendedClasses, 9);
  assert.equal(attendance.totalClasses, 10);
  assert.equal(attendance.attendancePercent, 90);
  assert.equal(attendance.subjects[0].attendedClasses, 9);
  assert.equal(attendance.subjects[0].totalClasses, 10);
  assert.equal(attendanceRecords.filter((record) => record.student_id === profile.id && record.attended === false).length, 1);
});

test('returns zero attendance without division by zero when no records exist', async () => {
  const originalRecords = attendanceRecords.splice(0);
  try {
    const response = await request('/api/attendance', {}, studentCookie);
    const attendance = (await response.json()).data;
    assert.equal(response.status, 200);
    assert.equal(attendance.attendedClasses, 0);
    assert.equal(attendance.totalClasses, 0);
    assert.equal(attendance.attendancePercent, 0);
    assert.equal(attendance.subjects[0].attendancePercent, 0);
  } finally {
    attendanceRecords.push(...originalRecords);
  }
});

test('isolates academic records and campus interactions between student sessions', async () => {
  const secondCookie = await signIn(secondStudentUser.email);

  const secondProfileResponse = await request('/api/profile', {}, secondCookie);
  const secondProfileBody = (await secondProfileResponse.json()).data;
  assert.equal(secondProfileResponse.status, 200);
  assert.equal(secondProfileBody.studentNumber, secondProfile.studentNumber);
  assert.equal(secondProfileBody.course, secondProfile.course);
  assert.equal(secondProfileBody.semester, secondProfile.semester);

  const firstAttendance = (await (await request('/api/attendance', {}, studentCookie)).json()).data;
  const secondAttendance = (await (await request('/api/attendance', {}, secondCookie)).json()).data;
  assert.equal(firstAttendance.attendancePercent, 90);
  assert.equal(firstAttendance.subjects[0].code, 'CS204');
  assert.equal(secondAttendance.attendancePercent, 50);
  assert.equal(secondAttendance.subjects[0].code, 'MA202');

  const secondAssignments = (await (await request('/api/assignments', {}, secondCookie)).json()).data;
  assert.equal(secondAssignments.length, 1);
  assert.equal(secondAssignments[0].subjectCode, 'MA202');

  const foreignAssignment = await request('/api/assignments/2/status', {
    method: 'PUT', body: JSON.stringify({ status: 'submitted' }),
  }, studentCookie);
  assert.equal(foreignAssignment.status, 403);

  const submitSecondAssignment = await request('/api/assignments/2/status', {
    method: 'PUT', body: JSON.stringify({ status: 'submitted' }),
  }, secondCookie);
  assert.equal(submitSecondAssignment.status, 403);

  const firstAssignment = (await (await request('/api/assignments', {}, studentCookie)).json()).data[0];
  const updatedSecondAssignment = (await (await request('/api/assignments', {}, secondCookie)).json()).data[0];
  assert.equal(firstAssignment.title, 'Trees');
  assert.equal(firstAssignment.status, 'Pending');
  assert.equal(updatedSecondAssignment.title, 'Linear Algebra');
  assert.equal(updatedSecondAssignment.status, 'Pending');

  const secondRegistration = await request('/api/events/1/registration', { method: 'POST' }, secondCookie);
  assert.equal(secondRegistration.status, 201);
  const firstEvents = (await (await request('/api/events', {}, studentCookie)).json()).data;
  const secondEvents = (await (await request('/api/events', {}, secondCookie)).json()).data;
  assert.equal(firstEvents[0].registered, false);
  assert.equal(secondEvents[0].registered, true);

  const secondRead = await request('/api/announcements/1/read', { method: 'PUT' }, secondCookie);
  assert.equal(secondRead.status, 200);
  const firstAnnouncements = (await (await request('/api/announcements', {}, studentCookie)).json()).data;
  const secondAnnouncements = (await (await request('/api/announcements', {}, secondCookie)).json()).data;
  assert.equal(firstAnnouncements[0].isRead, false);
  assert.equal(secondAnnouncements[0].isRead, true);

  const attemptedCourseChange = await request('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      name: secondProfile.name,
      course: profile.course,
      semester: profile.semester,
      email: secondProfile.email,
      phone: secondProfile.phone,
    }),
  }, secondCookie);
  assert.equal(attemptedCourseChange.status, 403);
});

test('updates student-owned records and blocks admin-only writes', async () => {
  const assignment = await request('/api/assignments/1/status', {
    method: 'PUT', body: JSON.stringify({ status: 'submitted' }),
  }, studentCookie);
  assert.equal(assignment.status, 403);

  const registration = await request('/api/events/1/registration', { method: 'POST' }, studentCookie);
  assert.equal(registration.status, 201);

  const noticeRead = await request('/api/announcements/1/read', { method: 'PUT' }, studentCookie);
  assert.equal(noticeRead.status, 200);

  const forbidden = await request('/api/events', {
    method: 'POST', body: JSON.stringify({ title: 'New event' }),
  }, studentCookie);
  assert.equal(forbidden.status, 403);
});

test('updates profiles and allows admin resource creation', async () => {
  const profileResponse = await request('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Updated Student', course: profile.course, semester: profile.semester,
      email: 'updated@example.test', phone: profile.phone,
    }),
  }, studentCookie);
  assert.equal(profileResponse.status, 200);

  adminCookie = await signIn(adminUser.email);
  const adminPage = await request('/admin.html', {}, adminCookie);
  assert.equal(adminPage.status, 200);
  const createEvent = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Campus Demo Day', description: 'Student demonstrations', eventType: 'Technology',
      startsAt: '2026-11-10T10:00:00.000Z', location: 'Innovation Hall',
    }),
  }, adminCookie);
  assert.equal(createEvent.status, 201);

  const createAssignment = await request('/api/assignments', {
    method: 'POST',
    body: JSON.stringify({ subjectCode: 'CS204', title: 'Tree exercise', description: 'Implement tree traversal.', dueAt: '2026-11-03T23:59:00' }),
  }, adminCookie);
  assert.equal(createAssignment.status, 201);

  const updateSubmission = await request('/api/assignments/1/status', {
    method: 'PUT',
    body: JSON.stringify({ studentNumber: profile.studentNumber, status: 'submitted' }),
  }, adminCookie);
  assert.equal(updateSubmission.status, 200);
  assert.equal((await updateSubmission.json()).data.studentNumber, profile.studentNumber);

  const createTimetableEntry = await request('/api/timetable', {
    method: 'POST',
    body: JSON.stringify({ subjectCode: 'CS204', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', room: 'A-204', classType: 'Lecture' }),
  }, adminCookie);
  assert.equal(createTimetableEntry.status, 201);

  const createAnnouncement = await request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ title: 'Lab update', body: 'Lab starts at 10:15.', category: 'Academic' }),
  }, adminCookie);
  assert.equal(createAnnouncement.status, 201);

  const addAttendance = await request('/api/attendance/records', {
    method: 'POST',
    body: JSON.stringify({ studentNumber: profile.studentNumber, subjectCode: 'CS204', classDate: '2026-10-22', attended: true }),
  }, adminCookie);
  assert.equal(addAttendance.status, 201);
  assert.equal(attendanceWrites.at(-1).params[0], profile.id);
  assert.equal(attendanceWrites.at(-1).params[1], 1);
  assert.match(attendanceWrites.at(-1).sql, /ON DUPLICATE KEY UPDATE attended = VALUES\(attended\)/);

  const adminOverview = await request('/api/admin/overview', {}, adminCookie);
  assert.equal(adminOverview.status, 200);
  const overview = (await adminOverview.json()).data;
  assert.equal(overview.studentCount, 2);
  assert.equal(overview.subjectCount, 4);
  assert.equal(overview.upcomingEvents.length, 1);

  const studentDirectory = await request('/api/admin/students?search=Test', {}, adminCookie);
  assert.equal(studentDirectory.status, 200);
  assert.equal((await studentDirectory.json()).data[0].attendancePercent, 90);

  const adminSubjects = await request('/api/admin/subjects', {}, adminCookie);
  assert.equal(adminSubjects.status, 200);
  const priyaSubjects = await request('/api/admin/subjects?course=B.Sc%20IT&semester=Semester%204', {}, adminCookie);
  const priyaSubjectRows = (await priyaSubjects.json()).data;
  assert.equal(priyaSubjects.status, 200);
  assert.deepEqual(priyaSubjectRows.map((subject) => subject.code), ['IT204']);
  assert.equal(priyaSubjectRows[0].course, 'B.Sc IT');
  assert.equal(priyaSubjectRows[0].semester, 'Semester 4');
  const otherSemester = await request('/api/admin/subjects?course=B.Sc%20IT&semester=Semester%203', {}, adminCookie);
  assert.deepEqual((await otherSemester.json()).data, []);

  const attendanceAccess = await request('/api/attendance', {}, adminCookie);
  assert.equal(attendanceAccess.status, 403);
});

test('rejects student access to admin pages, admin data, and attendance writes', async () => {
  const page = await request('/admin.html', {}, studentCookie);
  assert.equal(page.status, 403);

  for (const route of ['/api/admin/overview', '/api/admin/students', '/api/admin/subjects']) {
    const response = await request(route, {}, studentCookie);
    assert.equal(response.status, 403, `${route} must reject students`);
  }

  const attendanceWrite = await request('/api/attendance/records', {
    method: 'POST',
    body: JSON.stringify({ studentNumber: profile.studentNumber, subjectCode: 'CS204', classDate: '2026-10-23', attended: false }),
  }, studentCookie);
  assert.equal(attendanceWrite.status, 403);

  const assignmentWrite = await request('/api/assignments', {
    method: 'POST', body: JSON.stringify({ subjectCode: 'CS204', title: 'Unauthorized work', description: 'No', dueAt: '2026-11-03T23:59:00' }),
  }, studentCookie);
  assert.equal(assignmentWrite.status, 403);

  const announcementWrite = await request('/api/announcements', {
    method: 'POST', body: JSON.stringify({ title: 'Unauthorized notice', body: 'No', category: 'Academic' }),
  }, studentCookie);
  assert.equal(announcementWrite.status, 403);

  const wrongCourseSubject = await request('/api/attendance/records', {
    method: 'POST',
    body: JSON.stringify({ studentNumber: profile.studentNumber, subjectCode: 'MA202', classDate: '2026-10-23', attended: true }),
  }, adminCookie);
  assert.equal(wrongCourseSubject.status, 404);
});

test('student dashboard APIs only return the signed-in student academic records', async () => {
  const first = (await (await request('/api/attendance', {}, studentCookie)).json()).data;
  const secondCookie = await signIn(secondStudentUser.email);
  const second = (await (await request('/api/attendance', {}, secondCookie)).json()).data;
  assert.equal(first.subjects[0].code, 'CS204');
  assert.equal(second.subjects[0].code, 'MA202');
  assert.equal(first.attendancePercent, 90);
  assert.equal(second.attendancePercent, 50);
});

test('rejects mutation requests with a different origin', async () => {
  const response = await request('/api/auth/logout', {
    method: 'POST', headers: { Origin: 'https://untrusted.example' },
  }, studentCookie);
  assert.equal(response.status, 403);
});
