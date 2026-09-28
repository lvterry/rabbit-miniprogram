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

module.exports = { migrateCloudData }
