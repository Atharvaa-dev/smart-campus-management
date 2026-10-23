USE smart_campus;

INSERT INTO subjects (code, name, course, semester) VALUES
  ('CS204', 'Data Structures', 'B.Tech Computer Science', 'Semester 4'),
  ('CS206', 'Database Systems', 'B.Tech Computer Science', 'Semester 4'),
  ('CS208', 'Computer Networks', 'B.Tech Computer Science', 'Semester 4'),
  ('CS210', 'Operating Systems', 'B.Tech Computer Science', 'Semester 4'),
  ('MA204', 'Discrete Mathematics', 'B.Tech Computer Science', 'Semester 4'),
  ('IT204', 'Web Application Development', 'B.Sc IT', 'Semester 4'),
  ('IT206', 'Software Engineering', 'B.Sc IT', 'Semester 4'),
  ('IT208', 'Data Communication and Networking', 'B.Sc IT', 'Semester 4'),
  ('IT210', 'Java Programming', 'B.Sc IT', 'Semester 4'),
  ('IT212', 'Information Security', 'B.Sc IT', 'Semester 4')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  course = VALUES(course),
  semester = VALUES(semester),
  is_active = TRUE;

INSERT INTO assignments (subject_id, title, description, due_at)
SELECT subj.id, sample.title, sample.description, sample.due_at
FROM (
  SELECT 'CS204' AS subject_code, 'Binary Search Tree Implementation' AS title,
         'Implement insertion, search, and traversal operations for a binary search tree.' AS description,
         '2026-10-24 23:59:00' AS due_at
  UNION ALL SELECT 'CS206', 'Normalization and ER Modeling',
         'Create an ER model and normalize the supplied relational schema.', '2026-10-26 23:59:00'
  UNION ALL SELECT 'CS208', 'TCP Congestion Control Report',
         'Explain TCP congestion control and compare slow start with congestion avoidance.', '2026-10-28 23:59:00'
  UNION ALL SELECT 'CS210', 'Process Scheduling Simulator',
         'Build a simulator for first-come first-served and round-robin scheduling.', '2026-10-30 23:59:00'
  UNION ALL SELECT 'MA204', 'Graph Theory Problem Set',
         'Complete the graph theory exercises from Week 6.', '2026-10-18 23:59:00'
) AS sample
JOIN subjects subj ON subj.code = sample.subject_code
WHERE NOT EXISTS (
  SELECT 1 FROM assignments existing WHERE existing.title = sample.title
);

INSERT INTO timetable_entries (subject_id, day_of_week, start_time, end_time, room, class_type)
SELECT subj.id, sample.day_of_week, sample.start_time, sample.end_time,
       sample.room, sample.class_type
FROM (
  SELECT 'CS204' AS subject_code, 1 AS day_of_week, '09:00:00' AS start_time,
         '10:00:00' AS end_time, 'A-204' AS room, 'Lecture' AS class_type
  UNION ALL SELECT 'CS206', 1, '10:15:00', '11:15:00', 'C-110', 'Lecture'
  UNION ALL SELECT 'CS208', 1, '13:30:00', '14:30:00', 'B-312', 'Lecture'
  UNION ALL SELECT 'MA204', 2, '09:00:00', '10:00:00', 'D-105', 'Lecture'
  UNION ALL SELECT 'CS210', 2, '10:15:00', '11:15:00', 'A-108', 'Lecture'
  UNION ALL SELECT 'CS208', 3, '09:00:00', '10:00:00', 'B-312', 'Lecture'
  UNION ALL SELECT 'MA204', 3, '11:30:00', '12:30:00', 'D-105', 'Lecture'
  UNION ALL SELECT 'CS204', 4, '09:00:00', '10:00:00', 'A-204', 'Lecture'
  UNION ALL SELECT 'CS206', 4, '10:15:00', '11:15:00', 'C-110', 'Lab'
  UNION ALL SELECT 'CS210', 5, '09:00:00', '10:00:00', 'A-108', 'Lecture'
) AS sample
JOIN subjects subj ON subj.code = sample.subject_code
WHERE NOT EXISTS (
  SELECT 1 FROM timetable_entries existing
  WHERE existing.subject_id = subj.id
    AND existing.day_of_week = sample.day_of_week
    AND existing.start_time = sample.start_time
);

INSERT INTO campus_events (title, description, event_type, starts_at, location)
SELECT sample.title, sample.description, sample.event_type, sample.starts_at, sample.location
FROM (
  SELECT 'TechNova 2026' AS title,
         'A day of student-led demos, tech talks, and campus innovation.' AS description,
         'Technology' AS event_type, '2026-10-29 10:00:00' AS starts_at,
         'Innovation Auditorium' AS location
  UNION ALL SELECT 'Autumn Cultural Night',
         'Celebrate campus culture through live music, dance, and food.',
         'Campus life', '2026-11-02 18:00:00', 'Central Quadrangle'
  UNION ALL SELECT 'Career Paths: Product & Design',
         'Meet alumni and explore roles across product and design teams.',
         'Career', '2026-11-05 14:00:00', 'Seminar Hall B'
  UNION ALL SELECT 'Inter-college Football',
         'Support the campus team in the regional inter-college series.',
         'Sports', '2026-11-12 16:00:00', 'University Sports Ground'
) AS sample
WHERE NOT EXISTS (
  SELECT 1 FROM campus_events existing WHERE existing.title = sample.title
);

INSERT INTO announcements (title, body, category, published_at)
SELECT sample.title, sample.body, sample.category, sample.published_at
FROM (
  SELECT 'Mid-semester examination schedule published' AS title,
         'The mid-semester examination timetable is now available. Please review your course schedule and contact the academic office if you notice a conflict.' AS body,
         'Academic' AS category, '2026-10-21 09:00:00' AS published_at
  UNION ALL SELECT 'Library extended hours during assessment week',
         'The central library will remain open until 11:00 PM from October 26 through November 6. Study rooms can be reserved through the student desk.',
         'Campus', '2026-10-20 09:00:00'
  UNION ALL SELECT 'Update your student contact information',
         'Please check that your email address and phone number in your student profile are current so you receive important campus updates.',
         'Admin', '2026-10-18 09:00:00'
  UNION ALL SELECT 'Campus shuttle route update',
         'Shuttle stop C will move to the east gate from October 27 while maintenance work is underway.',
         'Transport', '2026-10-16 09:00:00'
) AS sample
WHERE NOT EXISTS (
  SELECT 1 FROM announcements existing WHERE existing.title = sample.title
);

-- Optional attendance demo data. Create a student numbered STU-2024-0187 first.
-- The 100 class records are dated within the 40 days before the seed is run.
INSERT INTO attendance_records (student_id, subject_id, class_date, attended)
SELECT student.id, subj.id,
       DATE_SUB(CURDATE(), INTERVAL ((21 - class_numbers.class_number) * 2) DAY),
       class_numbers.class_number <= sample.attended_classes
FROM (
  SELECT 'CS204' AS subject_code, 20 AS total_classes, 18 AS attended_classes
  UNION ALL SELECT 'CS206', 20, 17
  UNION ALL SELECT 'CS208', 20, 17
  UNION ALL SELECT 'CS210', 20, 15
  UNION ALL SELECT 'MA204', 20, 18
) AS sample
JOIN subjects subj ON subj.code = sample.subject_code
JOIN students student ON student.student_number = 'STU-2024-0187'
JOIN (
  SELECT 1 AS class_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
  UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
  UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16
  UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
) AS class_numbers ON class_numbers.class_number <= sample.total_classes
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_records existing
  WHERE existing.student_id = student.id
    AND existing.subject_id = subj.id
    AND existing.class_date = DATE_SUB(CURDATE(), INTERVAL ((21 - class_numbers.class_number) * 2) DAY)
);
