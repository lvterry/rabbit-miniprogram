const { accountProfile } = require('./account-profile')
const { domainError, fingerprint, financialReport, sessionView, sessionTransition, randomUUID } = require('./domain')

const sqlDateTime = value => value.replace('T', ' ').replace(/Z$/, '')

function createMysqlBusinessStore(pool) {
  async function transaction(work) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const result = await work(connection)
        await connection.commit()
        return result
      } catch (error) {
        await connection.rollback().catch(() => {})
        if (attempt === 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_CHECKREAD'].includes(error.code)) throw error
      } finally { connection.release() }
    }
  }

  async function mutate(owner, requestId, scope, fields, work) {
    return transaction(async connection => {
      const hash = fingerprint(scope, fields)
      if (requestId) {
        const [insert] = await connection.execute(
          'INSERT IGNORE INTO operation_requests (owner_openid, request_id, fingerprint, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
          [owner, requestId, hash])
        if (!insert.affectedRows) {
          const [rows] = await connection.execute(
            'SELECT fingerprint, result FROM operation_requests WHERE owner_openid = ? AND request_id = ? FOR UPDATE', [owner, requestId])
          if (rows[0].fingerprint !== hash) throw domainError('IDEMPOTENCY_CONFLICT', 'Request key was used for different fields')
          return typeof rows[0].result === 'string' ? JSON.parse(rows[0].result) : rows[0].result
        }
      }
      const result = await work(connection)
      if (requestId) await connection.execute(
        'UPDATE operation_requests SET result = ? WHERE owner_openid = ? AND request_id = ?',
        [JSON.stringify(result), owner, requestId])
      return result
    })
  }

  async function getSession(owner, id, runner = pool) {
    // All fields in a detail response must come from one database snapshot.
    if (runner === pool) return transaction(connection => getSession(owner, id, connection))
    const [rows] = await runner.execute(`SELECT cs.id, cs.course_id AS courseId,
      COALESCE(c.name, cs.course_name) AS title, DATE_FORMAT(cs.session_date, '%Y-%m-%d') AS date,
      DATE_FORMAT(cs.start_time, '%H:%i') AS start, DATE_FORMAT(cs.end_time, '%H:%i') AS end,
      IFNULL(DATE_FORMAT(cs.end_date, '%Y-%m-%d'), '') AS endDate,
      cs.notes AS note, cs.status, cs.version,
      DATE_FORMAT(cs.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
      FROM class_sessions cs LEFT JOIN courses c ON c.id = cs.course_id AND c.owner_openid = cs.owner_openid
      WHERE cs.id = ? AND cs.owner_openid = ?`, [id, owner])
    if (!rows.length) return null
    const [bookings] = await runner.execute(`SELECT b.student_id AS studentId, s.name,
      s.remaining_credits AS remainingCredits, b.credit_consumed AS creditConsumed
      FROM bookings b JOIN students s ON s.id = b.student_id AND s.owner_openid = b.owner_openid
      WHERE b.session_id = ? AND b.owner_openid = ? ORDER BY b.student_id`, [id, owner])
    const [history] = await runner.execute(`SELECT id, title, notes AS note, action, version,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS time FROM session_events
      WHERE session_id = ? AND owner_openid = ? ORDER BY version DESC`, [id, owner])
    return sessionView(rows[0], bookings, history)
  }

  async function studentDetails(owner, id, runner = pool) {
    const [grants] = await runner.execute(`SELECT id, amount, fee, notes AS note,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS time FROM student_credits
      WHERE student_id = ? AND owner_openid = ?`, [id, owner])
    const [entries] = await runner.execute(`SELECT id, delta, kind, title, notes AS note,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS time FROM credit_ledger
      WHERE student_id = ? AND owner_openid = ? AND kind <> 'grant'`, [id, owner])
    const creditHistory = [...grants.map(row => ({ id: row.id, time: row.time, title: `添加 ${Number(row.amount)} 次课时`,
      detail: Number(row.fee) ? `费用：¥${Number(row.fee)}` : '未填写费用', note: row.note })),
    ...entries.map(row => ({ id: row.id, time: row.time, title: row.title, note: row.note,
      detail: `${Number(row.delta) > 0 ? '+' : ''}${Number(row.delta)} 次` }))]
      .sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id))
    const [ids] = await runner.execute(`SELECT session_id AS id FROM bookings WHERE student_id = ? AND owner_openid = ?`, [id, owner])
    const appointments = []
    for (const item of ids) appointments.push(await getSession(owner, item.id, runner))
    appointments.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    const appointmentHistory = appointments.flatMap(item => item.history.map(event => ({ ...event,
      detail: `${item.title} · ${item.date} ${item.start}–${item.endDate ? '次日 ' : ''}${item.end}` })))
      .sort((a, b) => b.time.localeCompare(a.time) || b.version - a.version)
    return { creditHistory, appointments, appointmentHistory }
  }

  async function writeEvent(connection, owner, sessionId, action, title, note, version) {
    await connection.execute(`INSERT INTO session_events
      (id, owner_openid, session_id, action, title, notes, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [randomUUID(), owner, sessionId, action, title, note, version])
  }

  return {
    transaction, mutate, studentDetails, getSession,

    async listSessions(owner, from, to) {
      return transaction(async connection => {
        const [rows] = await connection.execute(`SELECT id FROM class_sessions
          WHERE owner_openid = ? AND session_date >= ? AND session_date <= ? ORDER BY session_date, start_time, id`, [owner, from, to])
        const sessions = []
        for (const row of rows) sessions.push(await getSession(owner, row.id, connection))
        return sessions
      })
    },

    async createSession(owner, fields, requestId, studentId) {
      return mutate(owner, requestId, 'createSession', { ...fields, studentId }, async connection => {
        const studentIds = studentId ? [studentId] : [...fields.studentIds].sort()
        const students = []
        // Lock students in a stable order for both single and group sessions.
        for (const id of studentIds) {
          const [rows] = await connection.execute('SELECT id, course_id AS courseId FROM students WHERE id = ? AND owner_openid = ? FOR UPDATE', [id, owner])
          if (!rows.length) throw domainError('STUDENT_NOT_FOUND', 'Student not found')
          students.push(rows[0])
        }
        const courseId = fields.courseId || students[0].courseId
        if (!courseId) throw domainError('COURSE_REQUIRED', 'Select a course before scheduling')
        const [courses] = await connection.execute('SELECT name FROM courses WHERE id = ? AND owner_openid = ?', [courseId, owner])
        if (!courses.length) throw domainError('COURSE_NOT_FOUND', 'Course not found')
        if (students.some(student => student.courseId !== courseId)) throw domainError('ENROLLMENT_REQUIRED', 'Students must be associated with this course')
        const id = randomUUID()
        await connection.execute(`INSERT INTO class_sessions
          (id, owner_openid, course_id, course_name, session_date, start_time, end_date, end_time, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [id, owner, courseId, courses[0].name, fields.date, `${fields.start}:00`, fields.endDate || null, `${fields.end}:00`, fields.notes || ''])
        for (const student of students) await connection.execute(
          'INSERT INTO bookings (id, owner_openid, session_id, student_id) VALUES (?, ?, ?, ?)', [randomUUID(), owner, id, student.id])
        await writeEvent(connection, owner, id, 'create', '添加预约', fields.notes || '', 0)
        return { session: await getSession(owner, id, connection) }
      })
    },

    async changeSession(owner, id, fields, requestId) {
      return mutate(owner, requestId, `session:${id}`, fields, async connection => {
        const [rows] = await connection.execute('SELECT id FROM class_sessions WHERE id = ? AND owner_openid = ? FOR UPDATE', [id, owner])
        if (!rows.length) throw domainError('SESSION_NOT_FOUND', 'Session not found')
        const session = await getSession(owner, id, connection)
        const { next, consumed, title } = sessionTransition(session, fields)
        const [bookings] = await connection.execute(`SELECT id, student_id AS studentId, credit_consumed AS creditConsumed,
          consumed_entry_id AS consumedEntryId FROM bookings WHERE session_id = ? AND owner_openid = ? ORDER BY student_id`, [id, owner])
        for (const booking of bookings) {
          const [students] = await connection.execute('SELECT remaining_credits AS balance FROM students WHERE id = ? AND owner_openid = ? FOR UPDATE', [booking.studentId, owner])
          const delta = Number(!!booking.creditConsumed) - Number(!!consumed)
          if (delta < 0 && Number(students[0].balance) < 1) throw domainError('INSUFFICIENT_CREDITS', 'Add credits before consuming a lesson')
          if (!delta) continue
          const entryId = randomUUID()
          await connection.execute(`INSERT INTO credit_ledger
            (id, owner_openid, student_id, booking_id, reverses_entry_id, delta, kind, title, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
          [entryId, owner, booking.studentId, booking.id, delta > 0 ? booking.consumedEntryId : null,
            delta, delta > 0 ? 'return' : 'consume', title, fields.actionNote || ''])
          await connection.execute('UPDATE students SET remaining_credits = remaining_credits + ? WHERE id = ? AND owner_openid = ?', [delta, booking.studentId, owner])
          await connection.execute('UPDATE bookings SET credit_consumed = ?, consumed_entry_id = ? WHERE id = ? AND owner_openid = ?',
          [Number(consumed), consumed ? entryId : null, booking.id, owner])
        }
        await connection.execute(`UPDATE class_sessions SET session_date = ?, start_time = ?, end_date = ?, end_time = ?, notes = ?, status = ?, version = ?
          WHERE id = ? AND owner_openid = ?`, [next.date, `${next.start}:00`, next.endDate || null, `${next.end}:00`, next.note, next.status, next.version, id, owner])
        await writeEvent(connection, owner, id, fields.action, title, fields.actionNote || '', next.version)
        return { session: await getSession(owner, id, connection) }
      })
    },

    async getProfile(owner) {
      await pool.execute('INSERT IGNORE INTO accounts (id, owner_openid, created_at) VALUES (?, ?, UTC_TIMESTAMP(3))', [randomUUID(), owner])
      const [rows] = await pool.execute(`SELECT id, phone_number AS phoneNumber,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
        FROM accounts WHERE owner_openid = ?`, [owner])
      return accountProfile(rows[0])
    },

    async bindPhone(owner, { phoneNumber, countryCode }) {
      await this.getProfile(owner)
      await pool.execute('UPDATE accounts SET phone_number = ?, phone_country_code = ? WHERE owner_openid = ?', [phoneNumber, countryCode, owner])
      return this.getProfile(owner)
    },

    async addFeedback(owner, message, requestId) {
      return mutate(owner, requestId, 'feedback', { message }, async connection => {
        const feedback = { id: randomUUID(), message, createdAt: new Date().toISOString() }
        await connection.execute('INSERT INTO feedback (id, owner_openid, message, created_at) VALUES (?, ?, ?, ?)',
        [feedback.id, owner, message, sqlDateTime(feedback.createdAt)])
        return { feedback }
      })
    },

    async getFinancialReport(owner) {
      const [payments] = await pool.execute(`SELECT p.course_id AS courseId, COALESCE(c.name, p.course_name) AS courseName,
        p.amount, DATE_FORMAT(DATE_ADD(p.created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS date
        FROM payments p LEFT JOIN courses c ON c.id = p.course_id AND c.owner_openid = p.owner_openid
        WHERE p.owner_openid = ? AND p.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 MONTH)`, [owner])
      return financialReport(payments)
    }
  }
}

module.exports = { createMysqlBusinessStore }
