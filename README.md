# Smart Campus

Smart Campus is a full-stack campus portal. It keeps the existing HTML, CSS, and vanilla JavaScript pages and serves them from an Express API backed by MySQL.

## Demo login accounts

Use these credentials to quickly verify that the website is working locally after setup.

### Admin account

- Email: halamatharva4@gmail.com
- Full name: Atharva Halam
- Password: Admin@202666
- Role: Admin

### Student account

- Email: aarav.sharma@example.com
- Full name: Aarav Sharma
- Student number: STU-2026-0101
- Course: B.Tech Computer Science
- Semester: Semester 4
- Phone number: 9000000101
- Password: CampusTest@2027
- Role: Student

## Quick check to confirm the website works

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up the MySQL database and environment variables as described below in this README.

3. Start the application:

   ```bash
   npm run dev
   ```

4. Open the app in your browser:

   ```text
   http://localhost:3000
   ```

5. Log in using one of the demo accounts above.

6. Verify that the app loads correctly:
   - Admin login opens the admin dashboard.
   - Student login opens the student dashboard.
   - Pages load without errors.
   - You can navigate between dashboard sections such as attendance, timetable, assignments, announcements, and events.

7. For a quick check, sign in with the admin account first to confirm the admin area works, then sign out and log in with the student account to confirm the student view works.

Smart Campus is a full-stack campus portal. It keeps the existing HTML, CSS, and vanilla JavaScript pages and serves them from an Express API backed by MySQL.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0 or newer
- A terminal in the project root

## 1. Create the database

The schema defaults to the database name `smart_campus`, which matches `.env.example`. If you choose a different database name, update the `CREATE DATABASE` and `USE` statements in both SQL files [...]

```powershell
Get-Content -Raw server/database/schema.sql | mysql -u root -p
```

For the application, create a separate MySQL user with access only to `smart_campus` (replace the password with a unique value):

```sql
CREATE USER 'smart_campus_app'@'127.0.0.1' IDENTIFIED BY 'use-a-unique-password-here';
GRANT SELECT, INSERT, UPDATE, DELETE ON smart_campus.* TO 'smart_campus_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Run these statements using your MySQL administrator account. The application does not need schema creation privileges after initialization.

## 2. Configure environment variables

Copy `.env.example` to `.env` in the project root (PowerShell: `Copy-Item .env.example .env`). Fill in `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` for your MyS[...]

Generate a session secret locally and put its output in `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`BCRYPT_ROUNDS` defaults to 12. Set `NODE_ENV=production` only behind HTTPS; production mode enables the `Secure` cookie flag. If HTTPS terminates at a reverse proxy, set `TRUST_PROXY_HOPS=1` for [...]

## 3. Install dependencies and initialize example data

From the project root:

```powershell
npm install
```

Create a student for the optional attendance seed. The command prompts for a password without echoing it; use at least 12 characters. Keep the sample student number if you want the seed's sample a[...]

```powershell
npm run student:create -- --email aarav.sharma@campus.edu --name "Aarav Sharma" --student-number STU-2024-0187 --course "B.Tech Computer Science" --semester "Semester 4" --phone "+91 98765 43210"
```

Load the sample subjects, assignments, timetable, events, announcements, and the optional attendance data:

```powershell
Get-Content -Raw server/database/seed.sql | mysql -u root -p smart_campus
```

The seed is repeatable: it skips existing sample records. It creates attendance rows only for the student number `STU-2024-0187`.

## 4. Create the first admin account

Create the administrator from an interactive terminal so the password is entered without echo and is hashed with bcrypt before it reaches MySQL:

```powershell
npm run admin:create -- --email admin@campus.edu --name "Campus Admin"
```

The admin command never creates a default account and never accepts a password in command-line arguments. Admin accounts can open the role-protected `admin.html` dashboard to review campus counts [...]

Create further student accounts through the same CLI pattern:

```powershell
npm run student:create -- --email student@campus.edu --name "Student Name" --student-number STU-2024-0001 --course "B.Tech Computer Science" --semester "Semester 4" --phone "+91 90000 00000"
```

## 5. Run the application

Run the Express server from the project root. Express serves the frontend and API on the same origin by default. The HTML pages load `/css/style.css`, `/js/config.js`, and `/js/app.js`; the server[...]

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use the account created by the CLI to sign in. Press `Ctrl+C` to stop the server. For a non-watch run, use `npm start`.

### Optional: run the frontend on a separate port

For VS Code Live Server, `js/config.js` uses `http://localhost:3000/api` when the frontend is served from `http://localhost:5500`; deployed and same-origin requests use `/api`. Add the exact front[...]

The normal setup requires just one terminal: `npm run dev`, then open `http://localhost:3000`. For the separate-port setup, start Express in one terminal and Live Server from VS Code on the proje[...]

## API routes

All successful API responses use a `{ "data": ... }` envelope. Validation errors return `400`, missing sessions return `401`, insufficient roles return `403`, and missing records return `404`.

| Method and route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Check server and database connectivity |
| `POST /api/auth/login` | Public, rate-limited | Sign in with student number/email and password |
| `POST /api/auth/logout` | Public | Revoke current session and clear cookie |
| `GET /api/auth/me` | Signed in | Current account and student profile |
| `GET /api/profile` | Student | Read profile |
| `PATCH /api/profile` | Student | Update name, course, semester, email, and phone |
| `GET /api/attendance` | Student | Subject totals and attendance percentages |
| `POST /api/attendance/records` | Admin | Add or update an attendance record |
| `GET /api/assignments` | Signed in | List course assignments and personal submission states |
| `POST /api/assignments` | Admin | Create an assignment |
| `PUT /api/assignments/:id/status` | Admin | Manage a student's submission status |
| `GET /api/timetable` | Signed in | List timetable entries |
| `POST /api/timetable` | Admin | Add a timetable entry |
| `GET /api/events` | Signed in | List upcoming campus events and registration states |
| `POST /api/events` | Admin | Create an event |
| `POST /api/events/:id/registration` | Student | Register for an event |
| `DELETE /api/events/:id/registration` | Student | Cancel an event registration |
| `GET /api/announcements` | Signed in | List published notices and read states |
| `POST /api/announcements` | Admin | Publish an announcement |
| `GET /api/admin/overview` | Admin | Student and subject counts plus upcoming events |
| `GET /api/admin/students?search=...` | Admin | Search student profiles and attendance totals |
| `GET /api/admin/subjects` | Admin | List active subjects for admin forms |
| `PUT /api/announcements/:id/read` | Student | Mark a notice read |
| `DELETE /api/announcements/:id/read` | Student | Mark a notice unread |

Login returns an HTTP-only, same-site session cookie. The database stores only an HMAC hash of each random session token. Passwords are stored as bcrypt hashes. API writes use validated request b[...]

Admin write payload examples:

`POST /api/assignments`

```json
{
  "subjectCode": "CS204",
  "title": "Tree traversal exercise",
  "description": "Implement in-order, pre-order, and post-order traversal.",
  "dueAt": "2026-11-03T23:59:00"
}

`POST /api/timetable`

```json
{
  "subjectCode": "CS204",
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "10:00",
  "room": "A-204",
  "classType": "Lecture"
}

`POST /api/events`

```json
{
  "title": "Campus Demo Day",
  "description": "Student project demonstrations.",
  "eventType": "Technology",
  "startsAt": "2026-11-10T10:00:00.000Z",
  "location": "Innovation Hall"
}

`POST /api/announcements`

```json
{
  "title": "Lab schedule update",
  "body": "The Thursday lab begins at 10:15 AM.",
  "category": "Academic"
}

`POST /api/attendance/records`

```json
{
  "studentNumber": "STU-2024-0187",
  "subjectCode": "CS204",
  "classDate": "2026-10-22",
  "attended": true
}
```

`PUT /api/assignments/:id/status` (admin only)

```json
{
  "studentNumber": "STU-2024-0187",
  "status": "submitted"
}
```

The account-creation commands and all database-backed routes require the connection values in `.env`. The included `npm test` suite uses a database stub to exercise HTTP behavior; it does not tes[...]

The UI's attendance display threshold and compact view preferences remain browser-local display preferences. Account data, attendance, assignments, timetable, event registration, and announcement[...]

## Security and deployment notes

- Do not commit `.env`, passwords, database URLs, or session secrets.
- Use HTTPS and `NODE_ENV=production` when deployed so session cookies are marked `Secure`.
- Restrict the database account to the application schema. Use a separate administrator account for schema initialization.
- The seed data is for local demonstration only. Replace it with institution-approved data before deployment.
- The backend serves only the existing HTML pages, `css/`, and `js/`; the `server/` source and SQL files are not exposed as static files.

## Project structure

```text
css/                         Shared responsive styles
js/app.js                    Frontend views and same-origin API interactions
server/database/schema.sql   MySQL schema
server/database/seed.sql     Optional sample academic data
server/src/app.js            Express middleware and role-protected admin page serving
server/src/auth.js           Secure sessions and role middleware
server/src/cli/              Interactive account creation
server/src/routes/           Student, admin, and shared REST route modules
```
