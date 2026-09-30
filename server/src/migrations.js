async function migrateAccountPhone(pool) {
  const [columns] = await pool.execute(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts'`)
  const existing = new Set(columns.map(column => column.COLUMN_NAME))
  for (const name of ['phone_number', 'phone_country_code']) {
    if (existing.has(name)) continue
    try {
      const length = name === 'phone_number' ? 32 : 8
      await pool.query(`ALTER TABLE accounts ADD COLUMN ${name} VARCHAR(${length}) NOT NULL DEFAULT ''`)
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }
}

// One-time, transactional conversion of the existing cloud data. No local demo seeds are imported.
async function migrateCloudData(pool) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute("INSERT IGNORE INTO schema_migrations (name) VALUES ('cloud-business-v1')")
    if (result.affectedRows) {
      await connection.query(`INSERT INTO credit_ledger
        (id, owner_openid, student_id, delta, kind, title, notes, created_at)
        SELECT id, owner_openid, id, remaining_credits, 'opening', '迁移期初余额', '', UTC_TIMESTAMP(3) FROM students`)
      await connection.query(`INSERT INTO payments
        (id, owner_openid, student_id, grant_id, course_id, course_name, amount, created_at)
        SELECT cr.id, cr.owner_openid, cr.student_id, cr.id, s.course_id, IFNULL(c.name, ''), cr.fee, cr.created_at
        FROM student_credits cr JOIN students s ON s.id = cr.student_id AND s.owner_openid = cr.owner_openid
        LEFT JOIN courses c ON c.id = s.course_id AND c.owner_openid = s.owner_openid WHERE cr.fee > 0`)
      await connection.query(`INSERT INTO class_sessions
        (id, owner_openid, course_id, course_name, session_date, start_time, end_date, end_time, notes, status, version, created_at)
        SELECT a.id, a.owner_openid, s.course_id, IFNULL(c.name, '未关联课程'), a.appointment_date,
               a.start_time, a.end_date, a.end_time, a.notes, a.status, 0, a.created_at
        FROM student_appointments a JOIN students s ON s.id = a.student_id AND s.owner_openid = a.owner_openid
        LEFT JOIN courses c ON c.id = s.course_id AND c.owner_openid = s.owner_openid`)
      await connection.query(`INSERT INTO bookings (id, owner_openid, session_id, student_id)
        SELECT id, owner_openid, id, student_id FROM student_appointments`)
      await connection.query(`INSERT INTO session_events
        (id, owner_openid, session_id, action, title, notes, version, created_at)
        SELECT id, owner_openid, id, 'create', '添加预约', notes, 0, created_at FROM student_appointments`)
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally {
    connection.release()
  }
}

async function migrateStudentAvatars(pool) {
  const [columns] = await pool.execute(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'avatar'`)
  if (!columns.length) {
    try { await pool.query('ALTER TABLE students ADD COLUMN avatar JSON NULL') }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error }
  }
  await pool.query(`UPDATE students SET avatar = JSON_OBJECT('style', 'geometric', 'version', 1, 'seed', id)
    WHERE avatar IS NULL`)
}

module.exports = { migrateAccountPhone, migrateCloudData, migrateStudentAvatars }
