const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const frontendSource = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');
const frontendConfigSource = fs.readFileSync(path.resolve(__dirname, '../../js/config.js'), 'utf8');

function createElement() {
  const classes = new Set();
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    dataset: {},
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
      toggle: (value) => classes.has(value) ? (classes.delete(value), false) : (classes.add(value), true),
    },
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return createElement(); },
    querySelectorAll() { return []; },
    focus() {},
    remove() {},
  };
}

function createFrontend(page, fetchMock, apiBaseUrl = '/api') {
  const elements = new Map();
  const listeners = new Map();
  const storage = new Map();
  const select = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createElement());
    return elements.get(selector);
  };
  const document = {
    body: { dataset: { page } },
    querySelector: select,
    querySelectorAll: () => [],
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const location = { replacedWith: '', replace(value) { this.replacedWith = value; } };
  const window = {
    innerWidth: 1200,
    location,
    SMART_CAMPUS_CONFIG: { apiBaseUrl },
    clearTimeout() {},
    setTimeout() { return 1; },
  };
  const context = {
    document,
    localStorage,
    window,
    location,
    fetch: fetchMock,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    console,
  };

  vm.runInNewContext(frontendSource, context, { filename: 'js/app.js' });
  return { elements, listeners, location, storage, select };
}

test('uses the shared local Express API base URL for frontend requests', async () => {
  const configContext = { window: {} };
  vm.runInNewContext(frontendConfigSource, configContext, { filename: 'js/config.js' });
  const apiBaseUrl = configContext.window.SMART_CAMPUS_CONFIG.apiBaseUrl;
  assert.equal(apiBaseUrl, 'http://localhost:3000/api');

  const calls = [];
  const frontend = createFrontend('dashboard', async (url, options) => {
    calls.push({ url, options });
    return response({}, 401);
  }, apiBaseUrl);
  await flush();

  assert.equal(calls[0].url, 'http://localhost:3000/api/auth/me');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
});

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return { data }; } };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('renders API-backed dashboard content and uses authenticated API endpoints', async () => {
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(url);
    const responses = {
      '/api/auth/me': { role: 'student', email: 'aarav@example.test', student: { name: 'Aarav Sharma', course: 'B.Tech Computer Science', semester: 'Semester 4' } },
      '/api/announcements': [
        { id: 1, title: 'Exam schedule', body: 'Schedule published', category: 'Academic', publishedAt: 'Oct 21, 2026', isRead: false },
        { id: 2, title: 'Library hours', body: 'Extended hours', category: 'Campus', publishedAt: 'Oct 20, 2026', isRead: true },
      ],
      '/api/attendance': { attendancePercent: 85, attendedClasses: 17, totalClasses: 20, subjects: [{ code: 'CS204', name: 'Data Structures', attendancePercent: 85, attendedClasses: 17, totalClasses: 20 }] },
      '/api/assignments': [
        { id: 1, title: 'Tree assignment from API', subject: 'Data Structures', dueAt: '2026-10-24T23:59:00', status: 'Pending' },
        { id: 2, title: 'Submitted assignment', subject: 'Database Systems', dueAt: '2026-10-20T23:59:00', status: 'Submitted' },
      ],
      '/api/events': [
        { id: 1, title: 'TechNova from API', description: 'Campus demos', eventType: 'Technology', startsAt: '2026-10-29T10:00:00', location: 'Auditorium', registered: false },
        { id: 2, title: 'Cultural Night from API', description: 'Campus arts', eventType: 'Campus life', startsAt: '2026-11-02T18:00:00', location: 'Quadrangle', registered: true },
      ],
      '/api/timetable': [{ id: 1, subject: 'Data Structures', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', room: 'A-204', classType: 'Lecture' }],
    };
    return response(responses[url]);
  };

  const frontend = createFrontend('dashboard', fetchMock);
  await flush();
  assert.match(frontend.select('#page-content').innerHTML, /Tree assignment from API/);
  assert.match(frontend.select('#page-content').innerHTML, /TechNova from API/);
  assert.match(frontend.select('#page-content').innerHTML, /class="stat-value">85%/);
  assert.match(frontend.select('#page-content').innerHTML, /class="stat-value">2<\/div><div class="stat-meta">For your course and semester/);
  assert.match(frontend.select('#page-content').innerHTML, /class="stat-value">2<\/div><div class="stat-meta">Registration is open/);
  assert.match(frontend.select('#page-content').innerHTML, /class="stat-value">1<\/div><div class="stat-meta">Unread campus notices/);
  assert(calls.includes('/api/attendance'));
});

test('shows data empty states for successful empty dashboard responses', async () => {
  const fetchMock = async (url) => {
    const responses = {
      '/api/auth/me': { role: 'student', email: 'gojo@example.test', student: { name: 'Gojo Sataro', course: 'B.Tech Computer Science', semester: 'Semester 4' } },
      '/api/announcements': [],
      '/api/attendance': { attendancePercent: 0, attendedClasses: 0, totalClasses: 0, subjects: [] },
      '/api/assignments': [],
      '/api/events': [],
      '/api/timetable': [],
    };
    return response(responses[url]);
  };

  const frontend = createFrontend('dashboard', fetchMock);
  await flush();
  const dashboard = frontend.select('#page-content').innerHTML;
  assert.match(dashboard, /class="stat-value">0%/);
  assert.match(dashboard, /Attendance records are not available yet/);
  assert.match(dashboard, /No assignments yet/);
  assert.match(dashboard, /No upcoming events/);
  assert.match(dashboard, /No announcements yet/);
  assert.doesNotMatch(dashboard, /We could not load this page/);
});

test('refreshes dashboard attendance from the backend on demand', async () => {
  const calls = [];
  let attendancePercent = 90;
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') return response({ role: 'student', email: 'aarav@example.test', student: { name: 'Aarav Sharma', course: 'B.Tech Computer Science', semester: 'Semester 4' } });
    if (url === '/api/announcements') return response([]);
    if (url === '/api/attendance') return response({ attendancePercent, attendedClasses: attendancePercent === 90 ? 9 : 19, totalClasses: 20, subjects: [] });
    if (url === '/api/assignments' || url === '/api/events' || url === '/api/timetable') return response([]);
    throw new Error(`Unexpected test fetch: ${url}`);
  };

  const frontend = createFrontend('dashboard', fetchMock);
  await flush();
  assert.match(frontend.select('#page-content').innerHTML, /class="stat-value">90%/);
  assert.equal(calls.filter((call) => call.url === '/api/attendance').length, 1);

  attendancePercent = 95;
  const refreshButton = { dataset: { action: 'dashboard-refresh' }, disabled: false, textContent: 'Refresh dashboard' };
  await frontend.listeners.get('click')({ target: { closest: () => refreshButton } });

  assert.equal(calls.filter((call) => call.url === '/api/attendance').length, 2);
  assert(calls.filter((call) => call.url === '/api/attendance').every((call) => call.options.cache === 'no-store'));
  assert.match(frontend.select('#page-content').innerHTML, /class="stat-value">95%/);
});

test('validates login fields and submits valid credentials to the API', async () => {
  const calls = [];
  const frontend = createFrontend('login', async (url, options) => {
    calls.push({ url, options });
    return response({ id: 2, role: 'student' });
  });
  const submit = frontend.listeners.get('submit');
  let prevented = false;
  const submitButton = createElement();
  const form = {
    id: 'login-form',
    querySelector: () => submitButton,
    elements: { namedItem: (name) => ({ identity: { value: 'STU-2024-0187' }, password: { value: '' } })[name] },
  };

  await submit({ target: form, preventDefault() { prevented = true; } });
  assert(prevented);
  assert.equal(calls.length, 0);
  assert.match(frontend.select('#login-error').textContent, /enter your student ID or email and password/i);

  form.elements.namedItem = (name) => ({ identity: { value: 'STU-2024-0187' }, password: { value: 'legacy-pass' } })[name];
  await submit({ target: form, preventDefault() {} });
  assert.equal(calls[0].url, '/api/auth/login');
  assert.equal(JSON.parse(calls[0].options.body).identity, 'STU-2024-0187');
  assert.equal(JSON.parse(calls[0].options.body).password, 'legacy-pass');
  assert.equal(frontend.location.replacedWith, 'index.html');
  assert.match(frontend.select('#login-error').textContent, /sign in successful/i);
  assert.equal(submitButton.disabled, true);
  assert.equal(submitButton.textContent, 'Signed in');
});

test('renders the redesigned login page with the existing accessible sign-in fields', async () => {
  const frontend = createFrontend('login', async () => response({ role: 'student' }));
  await flush();
  const login = frontend.select('#app').innerHTML;
  assert.match(login, /class="login-screen"/);
  assert.match(login, /class="login-brand-panel"/);
  assert.match(login, /id="login-form"/);
  assert.match(login, /id="login-id"/);
  assert.match(login, /id="login-password"/);
  assert.match(login, /id="login-error"/);
  assert.match(login, /SMART CAMPUS PORTAL/);
});

test('shows a loading state while the login request is pending', async () => {
  let resolveRequest;
  const frontend = createFrontend('login', () => new Promise((resolve) => { resolveRequest = resolve; }));
  const submitButton = createElement();
  const form = {
    id: 'login-form',
    querySelector: () => submitButton,
    elements: {
      namedItem: (name) => ({ identity: { value: 'student@example.test' }, password: { value: 'a-registered-password' } })[name],
    },
  };

  const submitPromise = frontend.listeners.get('submit')({ target: form, preventDefault() {} });
  assert.equal(submitButton.disabled, true);
  assert.equal(submitButton.textContent, 'Signing in…');
  assert.equal(submitButton['aria-busy'], 'true');

  resolveRequest(response({ id: 7, role: 'student' }));
  await submitPromise;
  assert.equal(frontend.location.replacedWith, 'index.html');
});

test('shows invalid-credential and network errors and restores the sign-in button', async () => {
  const invalidCredentials = createFrontend('login', async () => ({
    ok: false,
    status: 401,
    async json() { return { error: 'The student ID/email or password is incorrect.' }; },
  }));
  const submitButton = createElement();
  const form = {
    id: 'login-form',
    querySelector: () => submitButton,
    elements: {
      namedItem: (name) => ({ identity: { value: 'student@example.test' }, password: { value: 'a-registered-password' } })[name],
    },
  };

  await invalidCredentials.listeners.get('submit')({ target: form, preventDefault() {} });
  assert.match(invalidCredentials.select('#login-error').textContent, /incorrect/i);
  assert.equal(submitButton.disabled, false);

  const networkFailure = createFrontend('login', async () => { throw new TypeError('Failed to fetch'); });
  await networkFailure.listeners.get('submit')({ target: form, preventDefault() {} });
  assert.match(networkFailure.select('#login-error').textContent, /unable to reach the campus server/i);
  assert.equal(submitButton.disabled, false);
});

test('keeps assignment details visible without submission controls and preserves event actions', async () => {
  let isRegistered = false;
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') return response({ role: 'student', email: 'aarav@example.test', student: { name: 'Aarav Sharma' } });
    if (url === '/api/announcements') return response([]);
    if (url === '/api/assignments') return response([{ id: 1, title: 'Tree assignment', description: 'Implement tree traversals.', subject: 'Data Structures', dueAt: '2026-10-24T23:59:00', status: 'pending' }]);
    if (url.startsWith('/api/events/') && options.method === 'POST') { isRegistered = true; return response({ registered: true }); }
    if (url === '/api/events') return response([{ id: 1, title: 'TechNova', description: 'Campus demos', eventType: 'Technology', startsAt: '2026-10-29T10:00:00', location: 'Auditorium', registered: isRegistered }]);
    if (url === '/api/timetable') return response([]);
    throw new Error(`Unexpected test fetch: ${url}`);
  };

  const assignments = createFrontend('assignments', fetchMock);
  await flush();
  assert.match(assignments.select('#assignment-rows').innerHTML, /Tree assignment/);
  assert.match(assignments.select('#assignment-rows').innerHTML, /Implement tree traversals/);
  assert.match(assignments.select('#assignment-rows').innerHTML, /Data Structures/);
  assert.match(assignments.select('#assignment-rows').innerHTML, /Oct 24, 2026/);
  assert.doesNotMatch(assignments.select('#page-content').innerHTML, /assignment-filter|>Status<|>Action</);
  assert.doesNotMatch(assignments.select('#page-content').innerHTML, /Mark submitted|Reopen|assignment-status/);
  assert.equal(calls.some((call) => call.url.includes('/api/assignments/') && call.options.method === 'PUT'), false);

  const events = createFrontend('events', fetchMock);
  await flush();
  await events.listeners.get('click')({
    target: { closest: () => ({ dataset: { action: 'event-registration', id: '1', registered: 'false' } }) },
  });
  assert(calls.some((call) => call.url === '/api/events/1/registration' && call.options.method === 'POST'));
  assert.match(events.select('#event-cards').innerHTML, /Cancel registration/);
});

test('saves profile edits and announcement read state through the API', async () => {
  let savedProfile = { id: 8, studentNumber: 'STU-TEST-001', name: 'Aarav Sharma', course: 'B.Tech Computer Science', semester: 'Semester 4', email: 'aarav@example.test', phone: '+91 90000 00000' };
  let isRead = false;
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/auth/me') return response({ role: 'student', email: savedProfile.email, student: savedProfile });
    if (url.startsWith('/api/announcements/') && options.method === 'PUT') { isRead = true; return response({ id: 1, isRead }); }
    if (url === '/api/announcements') return response([{ id: 1, title: 'Exam schedule', body: 'Published', category: 'Academic', publishedAt: 'Oct 21, 2026', isRead }]);
    if (url === '/api/profile' && options.method === 'PATCH') { savedProfile = JSON.parse(options.body); return response({ ...savedProfile, studentNumber: 'STU-TEST-001' }); }
    if (url === '/api/profile') return response(savedProfile);
    throw new Error(`Unexpected test fetch: ${url}`);
  };

  const profile = createFrontend('profile', fetchMock);
  await flush();
  const values = {
    name: 'Updated Student', course: 'B.Tech Computer Science', semester: 'Semester 5',
    email: 'updated@example.test', phone: '+91 90000 00001',
  };
  const form = {
    id: 'profile-form',
    reportValidity: () => true,
    querySelector: () => createElement(),
    elements: { namedItem: (name) => ({ value: values[name] }) },
  };
  await profile.listeners.get('submit')({ target: form, preventDefault() {} });
  assert(calls.some((call) => call.url === '/api/profile' && call.options.method === 'PATCH'));
  assert.match(profile.select('#page-content').innerHTML, /Updated Student/);

  const announcements = createFrontend('announcements', fetchMock);
  await flush();
  await announcements.listeners.get('click')({
    target: { closest: () => ({ dataset: { action: 'announcement-read', id: '1', read: 'false' } }) },
  });
  assert(calls.some((call) => call.url === '/api/announcements/1/read' && call.options.method === 'PUT'));
  assert.match(announcements.select('#notice-list').innerHTML, /Mark unread/);
});
