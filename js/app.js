(function startSmartCampus() {
  const root = document.querySelector('#app');
  if (!root) return;

  const page = document.body.dataset.page || 'dashboard';
  const config = window.SMART_CAMPUS_CONFIG || {};
  const apiBase = (config.apiBaseUrl || '/api').replace(/\/$/, '');
  let currentUser = null;
  let profile = null;
  let dashboardData = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('The campus server returned an unreadable response.');
    }
    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status}).`);
    }
    return result.data;
  }

  function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function initials(name) {
    return String(name || 'Student').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function showMessage(message, kind = 'error') {
    const target = document.querySelector('#app-message');
    if (!target) return;
    target.textContent = message;
    target.className = `app-message ${kind}`;
    target.hidden = false;
  }

  function renderLogin() {
    root.innerHTML = `
      <main class="login-screen">
        <section class="login-brand-panel">
          <a class="brand" href="/login.html"><span class="brand-mark" aria-hidden="true">SC</span><span>Smart Campus</span></a>
          <div>
            <span class="eyebrow">SMART CAMPUS PORTAL</span>
            <h1>Your campus, connected.</h1>
            <p>Keep up with classes, attendance, assignments, events, and important campus updates in one place.</p>
            <div class="login-art" aria-hidden="true"><img src="/assets/images/campus-login.svg" alt=""></div>
          </div>
          <p class="login-footnote">A secure portal for students and campus administrators.</p>
        </section>
        <section class="login-panel">
          <form id="login-form" class="login-form" novalidate>
            <h2>Welcome back</h2>
            <p>Sign in with your student ID or campus email.</p>
            <div id="login-error" class="app-message error" role="alert" aria-live="polite" hidden></div>
            <div class="field">
              <label for="login-id">Student ID or email</label>
              <input class="input" id="login-id" name="identity" autocomplete="username" required>
            </div>
            <div class="field">
              <label for="login-password">Password</label>
              <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn btn-primary" type="submit">Sign in</button>
            <p class="login-help">If you need access, contact your campus administrator.</p>
          </form>
        </section>
      </main>`;
  }

  const navItems = [
    ['dashboard', 'Dashboard', '/index.html'],
    ['attendance', 'Attendance', '/attendance.html'],
    ['assignments', 'Assignments', '/assignments.html'],
    ['timetable', 'Timetable', '/timetable.html'],
    ['events', 'Events', '/events.html'],
    ['announcements', 'Announcements', '/announcements.html'],
    ['profile', 'My profile', '/profile.html'],
    ['settings', 'Settings', '/settings.html'],
  ];

  function renderShell() {
    const isAdmin = currentUser.role === 'admin';
    const links = isAdmin ? [['admin', 'Admin dashboard', '/admin.html']] : navItems;
    const displayName = currentUser.student?.name || currentUser.email;
    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <a class="brand" href="${isAdmin ? '/admin.html' : '/index.html'}"><span class="brand-mark" aria-hidden="true">SC</span><span>Smart Campus</span></a>
          <p class="nav-label">${isAdmin ? 'Administration' : 'Student portal'}</p>
          <nav class="nav-list" aria-label="Main navigation">
            ${links.map(([key, label, href]) => `<a class="nav-link${page === key ? ' active' : ''}" href="${href}"${page === key ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`).join('')}
          </nav>
          <div class="nav-bottom">
            ${isAdmin ? '' : '<a class="nav-link" href="/profile.html">My profile</a>'}
            <button class="nav-link logout-button" type="button" data-action="logout">Sign out</button>
            <p class="sidebar-note">Smart Campus Management</p>
          </div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div class="topbar-left"><button class="icon-button mobile-menu" type="button" aria-label="Toggle navigation" data-action="menu">☰</button><div><div class="eyebrow">${isAdmin ? 'Campus administration' : 'Student portal'}</div><p class="page-title">${escapeHtml(pageTitle(page, isAdmin))}</p></div></div>
            <div class="student-menu"><span class="avatar">${escapeHtml(initials(displayName))}</span><div><b>${escapeHtml(displayName)}</b><span>${isAdmin ? 'Administrator' : escapeHtml(currentUser.student?.studentNumber || currentUser.email)}</span></div></div>
          </header>
          <div id="app-message" class="app-message" role="status" hidden></div>
          <section id="page-content" class="content" aria-live="polite"><p class="loading-state">Loading your campus information…</p></section>
        </main>
      </div>`;
  }

  function pageTitle(key, isAdmin) {
    if (isAdmin) return key === 'admin' ? 'Administration overview' : 'Dashboard';
    return ({
      dashboard: 'Student dashboard',
      attendance: 'Attendance',
      assignments: 'Assignments',
      timetable: 'Timetable',
      events: 'Campus events',
      announcements: 'Announcements',
      profile: 'My profile',
      settings: 'Settings',
    })[key] || 'Student dashboard';
  }

  function content() {
    return document.querySelector('#page-content');
  }

  function emptyState(message) {
    return `<p class="empty-state">${escapeHtml(message)}</p>`;
  }

  function stat(label, value, meta) {
    return `<article class="card stat-card"><div class="stat-top">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-meta">${escapeHtml(meta)}</div></article>`;
  }

  function attendanceMarkup(data) {
    if (!data.subjects?.length) {
      return emptyState('Attendance records are not available yet.');
    }
    return data.subjects.map((subject) => `
      <div class="progress-item">
        <span class="subject">${escapeHtml(subject.code)} · ${escapeHtml(subject.name)}</span>
        <div class="progress" aria-label="${escapeHtml(subject.attendancePercent)}% attendance"><span${subject.attendancePercent < 75 ? ' class="low"' : ''} style="width:${Math.min(100, Math.max(0, Number(subject.attendancePercent) || 0))}%"></span></div>
        <span class="percent">${escapeHtml(subject.attendancePercent)}%</span>
      </div>`).join('');
  }

  function renderAttendance(data, target = '#attendance-subjects') {
    const markup = attendanceMarkup(data);
    const element = document.querySelector(target);
    if (element) element.innerHTML = markup;
    return markup;
  }

  function assignmentMarkup(rows) {
    if (!rows.length) {
      return emptyState('No assignments yet.');
    }
    return rows.map((assignment) => `
      <article class="assignment-card card">
        <div class="list-copy"><span class="badge blue">${escapeHtml(assignment.subjectCode || assignment.subject || 'Course')}</span><span class="badge">${escapeHtml(assignment.status || 'Pending')}</span></div>
        <h3>${escapeHtml(assignment.title)}</h3><p>${escapeHtml(assignment.description || '')}</p>
        <div class="card-foot"><span>${escapeHtml(assignment.subject || assignment.subjectCode || '')}</span><span>Due ${formatDate(assignment.dueAt)}</span></div>
      </article>`).join('');
  }

  function renderAssignments(rows, target = '#assignment-rows') {
    const markup = assignmentMarkup(rows);
    const element = document.querySelector(target);
    if (element) element.innerHTML = markup;
    return markup;
  }

  function eventMarkup(rows) {
    if (!rows.length) {
      return emptyState('No upcoming events.');
    }
    return rows.map((event) => `
      <article class="event-card card">
        <div class="event-date">${formatDate(event.startsAt, { month: 'short', day: 'numeric' })}</div>
        <span class="badge blue">${escapeHtml(event.eventType || 'Campus')}</span>
        <h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.description || '')}</p>
        <div class="card-foot"><span>${escapeHtml(event.location)}</span>
          <button class="btn ${event.registered ? 'btn-secondary' : 'btn-primary'}" type="button" data-action="event-registration" data-id="${escapeHtml(event.id)}" data-registered="${Boolean(event.registered)}">${event.registered ? 'Cancel registration' : 'Register'}</button>
        </div>
      </article>`).join('');
  }

  function renderEvents(rows, target = '#event-cards') {
    const markup = eventMarkup(rows);
    const element = document.querySelector(target);
    if (element) element.innerHTML = markup;
    return markup;
  }

  function announcementMarkup(rows) {
    if (!rows.length) {
      return emptyState('No announcements yet.');
    }
    return rows.map((notice) => `
      <article class="notice${notice.isRead ? '' : ' unread'}">
        <div class="list-icon" aria-hidden="true">i</div><div class="notice-content">
          <span class="badge">${escapeHtml(notice.category)}</span><div class="notice-title">${escapeHtml(notice.title)}</div>
          <p>${escapeHtml(notice.body)}</p><div class="notice-meta">${escapeHtml(notice.publishedAt || '')}</div>
        </div>
        <div class="notice-actions"><button class="btn btn-secondary" type="button" data-action="announcement-read" data-id="${escapeHtml(notice.id)}" data-read="${Boolean(notice.isRead)}">${notice.isRead ? 'Mark unread' : 'Mark read'}</button></div>
      </article>`).join('');
  }

  function renderAnnouncements(rows, target = '#notice-list') {
    const markup = announcementMarkup(rows);
    const element = document.querySelector(target);
    if (element) element.innerHTML = markup;
    return markup;
  }

  function timetableMarkup(rows) {
    if (!rows.length) {
      return emptyState('No timetable entries are available yet.');
    }
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return rows.map((entry) => `
      <div class="schedule-row"><span class="time">${escapeHtml(entry.startTime)}–${escapeHtml(entry.endTime)}</span><span class="timeline-mark"></span>
        <div><b>${escapeHtml(entry.subject)}</b><small>${escapeHtml(days[entry.dayOfWeek - 1] || 'Class')} · ${escapeHtml(entry.classType || 'Lecture')}</small></div>
        <span class="room">${escapeHtml(entry.room)}</span>
      </div>`).join('');
  }

  function renderTimetable(rows, target = '#timetable-rows') {
    const markup = timetableMarkup(rows);
    const element = document.querySelector(target);
    if (element) element.innerHTML = markup;
    return markup;
  }

  function renderDashboard(data) {
    dashboardData = data;
    const attendance = Number(data.attendance.attendancePercent) || 0;
    const unread = data.announcements.filter((notice) => !notice.isRead).length;
    const target = content();
    target.innerHTML = `
      <div class="welcome-row"><div><h1>Welcome, ${escapeHtml(currentUser.student?.name || 'student')}</h1><p>${escapeHtml(currentUser.student?.course || '')} · ${escapeHtml(currentUser.student?.semester || '')}</p></div><div class="dashboard-tools"><span class="date-label">${formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span><button class="btn btn-secondary" type="button" data-action="dashboard-refresh">Refresh dashboard</button></div></div>
      <div class="stats-grid">
        ${stat('Attendance', `${attendance}%`, `${data.attendance.attendedClasses || 0} of ${data.attendance.totalClasses || 0} classes attended`)}
        ${stat('Assignments', data.assignments.length, 'For your course and semester')}
        ${stat('Upcoming events', data.events.length, 'Registration is open')}
        ${stat('Unread announcements', unread, 'Unread campus notices')}
      </div>
      <div class="dashboard-grid">
        <article class="card"><div class="card-head"><div><h2>Attendance by subject</h2><p>Based on your recorded classes</p></div><a class="link-button" href="/attendance.html">View attendance</a></div><div id="attendance-subjects" class="card-body attendance-list">${attendanceMarkup(data.attendance)}</div></article>
        <article class="card"><div class="card-head"><div><h2>Weekly timetable</h2><p>Your scheduled classes</p></div><a class="link-button" href="/timetable.html">Full timetable</a></div><div id="timetable-rows" class="card-body compact-list">${timetableMarkup(data.timetable)}</div></article>
      </div>
      <div class="lower-grid dashboard-lower">
        <article class="card"><div class="card-head"><div><h2>Assignments</h2><p>Upcoming work</p></div><a class="link-button" href="/assignments.html">View all</a></div><div id="assignment-rows" class="card-body compact-list">${assignmentMarkup(data.assignments)}</div></article>
        <article class="card"><div class="card-head"><div><h2>Campus events</h2><p>Upcoming activities</p></div><a class="link-button" href="/events.html">Explore events</a></div><div id="event-cards" class="card-body compact-list">${eventMarkup(data.events)}</div></article>
        <article class="card"><div class="card-head"><div><h2>Announcements</h2><p>Campus updates</p></div><a class="link-button" href="/announcements.html">All notices</a></div><div id="notice-list" class="card-body compact-list">${announcementMarkup(data.announcements)}</div></article>
      </div>`;
    renderAttendance(data.attendance);
    renderTimetable(data.timetable);
    renderAssignments(data.assignments);
    renderEvents(data.events);
    renderAnnouncements(data.announcements);
  }

  async function loadStudentDashboard() {
    const [announcements, attendance, assignments, events, timetable] = await Promise.all([
      request('/announcements'),
      request('/attendance'),
      request('/assignments'),
      request('/events'),
      request('/timetable'),
    ]);
    renderDashboard({ announcements, attendance, assignments, events, timetable });
  }

  async function loadStudentPage() {
    const target = content();
    if (page === 'dashboard') {
      await loadStudentDashboard();
    } else if (page === 'attendance') {
      const data = await request('/attendance');
      target.innerHTML = `<div class="page-heading"><h1>Attendance overview</h1><p>${data.attendedClasses} of ${data.totalClasses} classes attended</p></div><div class="summary-strip">${stat('Overall attendance', `${data.attendancePercent}%`, 'Across your active subjects')}${stat('Classes attended', data.attendedClasses, 'Present records')}${stat('Total classes', data.totalClasses, 'Recorded sessions')}</div><article class="card"><div class="card-head"><h2>Subject attendance</h2></div><div id="attendance-subjects" class="card-body attendance-list"></div></article>`;
      renderAttendance(data);
    } else if (page === 'assignments') {
      const rows = await request('/assignments');
      target.innerHTML = `<div class="page-heading"><h1>Assignments</h1><p>Review your course work and due dates.</p></div><div class="assignment-grid" id="assignment-rows"></div>`;
      renderAssignments(rows);
    } else if (page === 'timetable') {
      const rows = await request('/timetable');
      target.innerHTML = `<div class="page-heading"><h1>Weekly timetable</h1><p>Your scheduled classes by day and time.</p></div><article class="card"><div class="card-body compact-list" id="timetable-rows"></div></article>`;
      renderTimetable(rows);
    } else if (page === 'events') {
      const rows = await request('/events');
      target.innerHTML = `<div class="page-heading"><h1>Campus events</h1><p>Explore upcoming activities and manage your registrations.</p></div><div class="event-grid" id="event-cards"></div>`;
      renderEvents(rows);
    } else if (page === 'announcements') {
      const rows = await request('/announcements');
      target.innerHTML = `<div class="page-heading"><h1>Announcements</h1><p>Important notices from your campus.</p></div><article class="card"><div class="notice-list" id="notice-list"></div></article>`;
      renderAnnouncements(rows);
    } else if (page === 'profile') {
      profile = await request('/profile');
      renderProfile(profile);
    } else {
      renderSettings();
    }
  }

  function renderProfile(data, message = '') {
    profile = data;
    content().innerHTML = `
      <div class="page-heading"><h1>My profile</h1><p>Update the contact details associated with your student account.</p></div>
      ${message ? `<p class="app-message success">${escapeHtml(message)}</p>` : ''}
      <div class="profile-layout"><article class="card profile-card"><div class="profile-avatar">${escapeHtml(initials(data.name))}</div><h2>${escapeHtml(data.name)}</h2><p>${escapeHtml(data.studentNumber)}</p>
        <div class="profile-detail"><span>Course</span><b>${escapeHtml(data.course)}</b></div><div class="profile-detail"><span>Semester</span><b>${escapeHtml(data.semester)}</b></div></article>
        <form id="profile-form" class="card form-card"><div class="form-grid">
          ${profileField('Full name', 'name', data.name)}
          ${profileField('Email address', 'email', data.email, 'email')}
          ${profileField('Phone number', 'phone', data.phone, 'tel')}
          ${profileField('Course', 'course', data.course, 'text', 'readonly')}
          ${profileField('Semester', 'semester', data.semester, 'text', 'readonly')}
          <div class="field full"><label>Student number</label><input class="input" value="${escapeHtml(data.studentNumber)}" readonly></div>
        </div><div class="form-actions"><button class="btn btn-primary" type="submit">Save profile</button></div></form>
      </div>`;
  }

  function profileField(label, name, value, type = 'text', extra = '') {
    return `<div class="field"><label for="profile-${name}">${escapeHtml(label)}</label><input class="input" id="profile-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra} required></div>`;
  }

  function renderSettings() {
    content().innerHTML = `
      <div class="page-heading"><h1>Settings</h1><p>Manage your local display preferences and session.</p></div>
      <article class="card"><div class="settings-list">
        <label class="setting-row"><span><b>Compact dashboard</b><small>Use a tighter layout on this device.</small></span><input class="switch" type="checkbox" data-setting="compact"></label>
        <label class="setting-row"><span><b>Show welcome message</b><small>Display your name at the top of the dashboard.</small></span><input class="switch" type="checkbox" data-setting="welcome" checked></label>
        <div class="setting-row"><span><b>Session</b><small>Your sign-in is secured by an HTTP-only session cookie.</small></span><button class="btn btn-secondary" type="button" data-action="logout">Sign out</button></div>
      </div></article>`;
    for (const input of document.querySelectorAll('[data-setting]')) {
      input.checked = localStorage.getItem(`smart-campus.${input.dataset.setting}`) !== 'false';
      applySetting(input.dataset.setting, input.checked);
    }
  }

  function applySetting(name, enabled) {
    const className = name === 'compact' ? 'compact-mode' : 'hide-welcome';
    if (enabled) root.classList.add(className);
    else root.classList.remove(className);
  }

  async function loadAdminDashboard() {
    const [overview, students, subjects, submissions] = await Promise.all([
      request('/admin/overview'),
      request('/admin/students'),
      request('/admin/subjects'),
      request('/admin/assignment-submissions'),
    ]);
    renderAdmin(overview, students, subjects, submissions);
  }

  function renderAdmin(overview, students, subjects, submissions) {
    const subjectOptions = subjects.map((subject) => `<option value="${escapeHtml(subject.code)}">${escapeHtml(subject.code)} · ${escapeHtml(subject.name)} (${escapeHtml(subject.course)} / ${escapeHtml(subject.semester)})</option>`).join('');
    const studentOptions = students.map((student) => `<option value="${escapeHtml(student.studentNumber)}">${escapeHtml(student.studentNumber)} · ${escapeHtml(student.name)}</option>`).join('');
    content().innerHTML = `
      <div class="welcome-row"><div><h1>Administration overview</h1><p>Manage campus information and review student activity.</p></div><span class="date-label">${formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
      <div class="stats-grid admin-stats">${stat('Students', overview.studentCount, 'Active student records')}${stat('Active subjects', overview.subjectCount, 'Across campus courses')}${stat('Upcoming events', overview.upcomingEvents.length, 'Published events')}</div>
      <div class="admin-columns">
        <section class="card form-card"><div class="card-head"><div><h2>Student directory</h2><p>Search active student profiles.</p></div></div><label for="admin-student-search">Search students</label><input class="input" id="admin-student-search" type="search" placeholder="Name, ID, course, or email"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Course</th><th>Attendance</th></tr></thead><tbody id="admin-students">${studentRows(students)}</tbody></table></div></section>
        <section class="card form-card"><div class="card-head"><div><h2>Upcoming events</h2><p>Next published campus events.</p></div></div><div class="compact-list">${overview.upcomingEvents.length ? overview.upcomingEvents.map((event) => `<div class="list-row"><div class="list-copy"><b>${escapeHtml(event.title)}</b><small>${formatDate(event.startsAt)} · ${escapeHtml(event.location)}</small></div><span class="badge blue">${escapeHtml(event.eventType)}</span></div>`).join('') : emptyState('No upcoming events.')}</div></section>
      </div>
      <section class="card form-card"><div class="card-head"><div><h2>Assignment submissions</h2><p>Review and update submission status for each student.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Assignment</th><th>Student</th><th>Due date</th><th>Status</th><th>Action</th></tr></thead><tbody>${submissionRows(submissions)}</tbody></table></div></section>
      <div class="admin-columns">
        <form class="card form-card" data-form="announcement"><div class="card-head"><div><h2>Publish announcement</h2><p>Share an update with students.</p></div></div><div class="field"><label for="notice-title">Title</label><input class="input" id="notice-title" name="title" required minlength="3"></div><div class="field"><label for="notice-category">Category</label><input class="input" id="notice-category" name="category" required value="Academic"></div><div class="field"><label for="notice-body">Message</label><textarea class="input" id="notice-body" name="body" rows="3" required></textarea></div><button class="btn btn-primary" type="submit">Publish announcement</button></form>
        <form class="card form-card" data-form="event"><div class="card-head"><div><h2>Create campus event</h2><p>Publish an upcoming activity.</p></div></div><div class="field"><label>Title</label><input class="input" name="title" required minlength="3"></div><div class="field"><label>Event type</label><input class="input" name="eventType" required value="Campus"></div><div class="field"><label>Description</label><textarea class="input" name="description" rows="2" required></textarea></div><div class="field"><label>Starts at</label><input class="input" name="startsAt" type="datetime-local" required></div><div class="field"><label>Location</label><input class="input" name="location" required></div><button class="btn btn-primary" type="submit">Create event</button></form>
        <form class="card form-card" data-form="assignment"><div class="card-head"><div><h2>Create assignment</h2><p>Assign work to a course subject.</p></div></div><div class="field"><label>Subject</label><select name="subjectCode" required>${subjectOptions}</select></div><div class="field"><label>Title</label><input class="input" name="title" required minlength="3"></div><div class="field"><label>Description</label><textarea class="input" name="description" rows="2" required></textarea></div><div class="field"><label>Due at</label><input class="input" name="dueAt" type="datetime-local" required></div><button class="btn btn-primary" type="submit">Create assignment</button></form>
        <form class="card form-card" data-form="timetable"><div class="card-head"><div><h2>Add timetable entry</h2><p>Schedule a class for a course.</p></div></div><div class="field"><label>Subject</label><select name="subjectCode" required>${subjectOptions}</select></div><div class="field"><label>Weekday</label><select name="dayOfWeek" required><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option></select></div><div class="field"><label>Start time</label><input class="input" name="startTime" type="time" required></div><div class="field"><label>End time</label><input class="input" name="endTime" type="time" required></div><div class="field"><label>Room</label><input class="input" name="room" required></div><div class="field"><label>Class type</label><input class="input" name="classType" value="Lecture" required></div><button class="btn btn-primary" type="submit">Add class</button></form>
        <form class="card form-card" data-form="attendance"><div class="card-head"><div><h2>Record attendance</h2><p>Update a student's class record.</p></div></div><div class="field"><label>Student</label><select name="studentNumber" required>${studentOptions}</select></div><div class="field"><label>Subject</label><select name="subjectCode" required>${subjectOptions}</select></div><div class="field"><label>Class date</label><input class="input" name="classDate" type="date" required></div><label class="setting-row"><span><b>Present</b></span><input name="attended" type="checkbox" checked></label><button class="btn btn-primary" type="submit">Save attendance</button></form>
      </div>`;
  }

  function submissionRows(submissions) {
    if (!submissions.length) return '<tr><td colspan="5">No assignment submissions to review.</td></tr>';
    return submissions.map((submission) => `
      <tr data-submission-row>
        <td><b>${escapeHtml(submission.assignmentTitle)}</b><br><span class="muted">${escapeHtml(submission.subjectCode)} · ${escapeHtml(submission.subjectName)}</span></td>
        <td><b>${escapeHtml(submission.studentName)}</b><br><span class="muted">${escapeHtml(submission.studentNumber)}</span></td>
        <td>${formatDate(submission.dueAt)}</td>
        <td><select aria-label="Status for ${escapeHtml(submission.assignmentTitle)} - ${escapeHtml(submission.studentName)}">
          <option value="pending"${submission.status === 'pending' ? ' selected' : ''}>Pending</option>
          <option value="in_progress"${submission.status === 'in_progress' ? ' selected' : ''}>In progress</option>
          <option value="submitted"${submission.status === 'submitted' ? ' selected' : ''}>Submitted</option>
        </select></td>
        <td><button class="btn btn-secondary" type="button" data-action="assignment-status-save" data-assignment-id="${escapeHtml(submission.assignmentId)}" data-student-number="${escapeHtml(submission.studentNumber)}">Save status</button></td>
      </tr>`).join('');
  }

  function studentRows(students) {
    if (!students.length) return '<tr><td colspan="3">No students found.</td></tr>';
    return students.map((student) => `<tr><td><b>${escapeHtml(student.name)}</b><br><span class="muted">${escapeHtml(student.studentNumber)} · ${escapeHtml(student.email)}</span></td><td>${escapeHtml(student.course)}<br><span class="muted">${escapeHtml(student.semester)}</span></td><td>${escapeHtml(student.attendancePercent)}%</td></tr>`).join('');
  }

  function formValue(form, name) {
    return form.elements.namedItem(name);
  }

  function formData(form, names) {
    return Object.fromEntries(names.map((name) => [name, formValue(form, name).value]));
  }

  async function submitLogin(form) {
    const identity = form.elements.namedItem('identity')?.value.trim();
    const password = form.elements.namedItem('password')?.value;
    const error = document.querySelector('#login-error');
    const button = form.querySelector('button[type="submit"]');
    if (!identity || !password) {
      error.textContent = 'Please enter your student ID or email and password.';
      error.hidden = false;
      return;
    }

    button.disabled = true;
    button.textContent = 'Signing in…';
    button.setAttribute('aria-busy', 'true');
    error.textContent = '';
    error.hidden = true;
    try {
      const user = await request('/auth/login', { method: 'POST', body: JSON.stringify({ identity, password }) });
      error.textContent = 'Sign in successful. Redirecting…';
      error.className = 'app-message success';
      error.hidden = false;
      button.textContent = 'Signed in';
      window.location.replace(user.role === 'admin' ? 'admin.html' : 'index.html');
    } catch (failure) {
      error.textContent = failure.name === 'TypeError'
        ? 'Unable to reach the campus server. Check your connection and try again.'
        : failure.message;
      error.className = 'app-message error';
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Sign in';
      button.setAttribute('aria-busy', 'false');
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (form.id === 'login-form') {
      event.preventDefault();
      await submitLogin(form);
      return;
    }
    if (form.id === 'profile-form') {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const payload = formData(form, ['name', 'course', 'semester', 'email', 'phone']);
      try {
        const saved = await request('/profile', { method: 'PATCH', body: JSON.stringify(payload) });
        currentUser.student = { ...currentUser.student, ...saved };
        renderProfile(saved, 'Profile saved.');
      } catch (failure) {
        showMessage(failure.message);
      }
      return;
    }
    const type = form.dataset.form;
    if (!type) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      if (type === 'announcement') {
        await request('/announcements', { method: 'POST', body: JSON.stringify(formData(form, ['title', 'body', 'category'])) });
      } else if (type === 'event') {
        const values = formData(form, ['title', 'description', 'eventType', 'startsAt', 'location']);
        values.startsAt = new Date(values.startsAt).toISOString();
        await request('/events', { method: 'POST', body: JSON.stringify(values) });
      } else if (type === 'assignment') {
        const values = formData(form, ['subjectCode', 'title', 'description', 'dueAt']);
        await request('/assignments', { method: 'POST', body: JSON.stringify(values) });
      } else if (type === 'timetable') {
        const values = formData(form, ['subjectCode', 'dayOfWeek', 'startTime', 'endTime', 'room', 'classType']);
        values.dayOfWeek = Number(values.dayOfWeek);
        await request('/timetable', { method: 'POST', body: JSON.stringify(values) });
      } else if (type === 'attendance') {
        const values = formData(form, ['studentNumber', 'subjectCode', 'classDate']);
        values.attended = Boolean(formValue(form, 'attended').checked);
        await request('/attendance/records', { method: 'POST', body: JSON.stringify(values) });
      }
      showMessage('Changes saved successfully.', 'success');
      form.reset();
      if (type === 'event' || type === 'announcement' || type === 'assignment' || type === 'timetable' || type === 'attendance') {
        await loadAdminDashboard();
      }
    } catch (failure) {
      showMessage(failure.message);
    }
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'assignment-status-save') {
      const row = button.closest('[data-submission-row]');
      const status = row?.querySelector('select')?.value;
      if (!row || !['pending', 'in_progress', 'submitted'].includes(status)) {
        showMessage('Choose a valid assignment status before saving.');
        return;
      }
      button.disabled = true;
      try {
        await request(`/assignments/${encodeURIComponent(button.dataset.assignmentId)}/status`, {
          method: 'PUT',
          body: JSON.stringify({ studentNumber: button.dataset.studentNumber, status }),
        });
        await loadAdminDashboard();
        showMessage('Assignment status saved successfully.', 'success');
      } catch (failure) {
        button.disabled = false;
        showMessage(failure.message);
      }
    } else if (action === 'dashboard-refresh') {
      button.disabled = true;
      button.textContent = 'Refreshing…';
      try {
        await loadStudentDashboard();
      } catch (failure) {
        showMessage(failure.message);
      }
      return;
    }
    if (action === 'event-registration') {
      const registered = button.dataset.registered === 'true';
      try {
        const result = await request(`/events/${encodeURIComponent(button.dataset.id)}/registration`, { method: registered ? 'DELETE' : 'POST' });
        const events = (await request('/events')).map((item) => item.id === Number(button.dataset.id)
          ? { ...item, registered: result.registered }
          : item);
        renderEvents(events);
        if (page === 'dashboard' && dashboardData) {
          dashboardData.events = events;
          renderDashboard(dashboardData);
        }
      } catch (failure) {
        showMessage(failure.message);
      }
    } else if (action === 'announcement-read') {
      const isRead = button.dataset.read === 'true';
      try {
        await request(`/announcements/${encodeURIComponent(button.dataset.id)}/read`, { method: isRead ? 'DELETE' : 'PUT' });
        const announcements = await request('/announcements');
        renderAnnouncements(announcements);
        if (page === 'dashboard' && dashboardData) {
          dashboardData.announcements = announcements;
          renderDashboard(dashboardData);
        }
      } catch (failure) {
        showMessage(failure.message);
      }
    } else if (action === 'logout') {
      try {
        await request('/auth/logout', { method: 'POST' });
        window.location.replace('/login.html');
      } catch (failure) {
        showMessage(failure.message);
      }
    } else if (action === 'menu') {
      document.querySelector('.sidebar')?.classList.toggle('open');
    }
  }

  function handleChange(event) {
    const setting = event.target.dataset.setting;
    if (setting) {
      localStorage.setItem(`smart-campus.${setting}`, String(event.target.checked));
      applySetting(setting, event.target.checked);
    }
  }

  async function handleSearch(event) {
    if (event.target.id !== 'admin-student-search') return;
    try {
      const students = await request(`/admin/students?search=${encodeURIComponent(event.target.value)}`);
      const rows = document.querySelector('#admin-students');
      if (rows) rows.innerHTML = studentRows(students);
    } catch (failure) {
      showMessage(failure.message);
    }
  }

  document.addEventListener('submit', handleSubmit);
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleSearch);

  if (page === 'login') {
    renderLogin();
    return;
  }

  async function initialize() {
    try {
      currentUser = await request('/auth/me');
      const isAdmin = currentUser.role === 'admin';
      if (page === 'admin' && !isAdmin) {
        window.location.replace('/index.html');
        return;
      }
      if (page !== 'admin' && isAdmin) {
        window.location.replace('/admin.html');
        return;
      }
      if (!isAdmin && !currentUser.student) {
        throw new Error('This account has no student profile. Contact your campus administrator.');
      }
      renderShell();
      if (isAdmin) await loadAdminDashboard();
      else await loadStudentPage();
    } catch (failure) {
      if (/authentication required/i.test(failure.message)) {
        window.location.replace('/login.html');
        return;
      }
      const target = content();
      if (target) target.innerHTML = `<div class="page-heading"><h1>We could not load this page</h1><p>${escapeHtml(failure.message)}</p><a class="btn btn-secondary" href="/index.html">Try again</a></div>`;
    }
  }

  void initialize();
}());
