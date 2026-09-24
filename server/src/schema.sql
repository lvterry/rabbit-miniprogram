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
