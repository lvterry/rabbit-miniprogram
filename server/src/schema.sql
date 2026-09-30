CREATE TABLE IF NOT EXISTS courses (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_owner_name (owner_openid, name),
  KEY idx_courses_owner_created (owner_openid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  course_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  name VARCHAR(40) NOT NULL,
  notes VARCHAR(300) NOT NULL DEFAULT '',
  total_credits INT UNSIGNED NOT NULL DEFAULT 0,
  remaining_credits INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_id_owner (id, owner_openid),
  KEY idx_students_owner_created (owner_openid, created_at),
  KEY idx_students_course (course_id),
  CONSTRAINT fk_students_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS student_credits (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount INT UNSIGNED NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_credits_student_history (student_id, owner_openid, created_at),
  CONSTRAINT fk_credits_student FOREIGN KEY (student_id, owner_openid)
    REFERENCES students (id, owner_openid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS student_appointments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_date DATE NULL,
  end_time TIME NOT NULL,
  notes VARCHAR(200) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_appointments_student_date (student_id, owner_openid, appointment_date, start_time),
  KEY idx_appointments_history (student_id, owner_openid, created_at),
  CONSTRAINT fk_appointments_student FOREIGN KEY (student_id, owner_openid)
    REFERENCES students (id, owner_openid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(40) NOT NULL DEFAULT '微信用户',
  phone_number VARCHAR(32) NOT NULL DEFAULT '',
  phone_country_code VARCHAR(8) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_owner (owner_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS class_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  course_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  course_name VARCHAR(40) NOT NULL,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_date DATE NULL,
  end_time TIME NOT NULL,
  notes VARCHAR(200) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_id_owner (id, owner_openid),
  KEY idx_sessions_owner_date (owner_openid, session_date, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  credit_consumed TINYINT NOT NULL DEFAULT 0,
  consumed_entry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_session_student (session_id, student_id),
  KEY idx_bookings_student (student_id, owner_openid),
  CONSTRAINT fk_bookings_session FOREIGN KEY (session_id, owner_openid)
    REFERENCES class_sessions (id, owner_openid),
  CONSTRAINT fk_bookings_student FOREIGN KEY (student_id, owner_openid)
    REFERENCES students (id, owner_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS session_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  notes VARCHAR(200) NOT NULL DEFAULT '',
  version INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_events_session (session_id, owner_openid, version),
  CONSTRAINT fk_events_session FOREIGN KEY (session_id, owner_openid)
    REFERENCES class_sessions (id, owner_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  reverses_entry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  delta INT NOT NULL,
  kind VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  notes VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ledger_reversal (reverses_entry_id),
  KEY idx_ledger_student (student_id, owner_openid, created_at),
  CONSTRAINT fk_ledger_student FOREIGN KEY (student_id, owner_openid)
    REFERENCES students (id, owner_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  grant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  course_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  course_name VARCHAR(40) NOT NULL DEFAULT '',
  amount DECIMAL(10,2) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_grant (grant_id),
  KEY idx_payment_owner_time (owner_openid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS feedback (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_feedback_owner_time (owner_openid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS operation_requests (
  owner_openid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result JSON NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (owner_openid, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
