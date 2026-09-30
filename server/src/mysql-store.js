const fs = require('node:fs')
const path = require('node:path')
const { createMysqlBusinessStore } = require('./mysql-business-store')
const { migrateAccountPhone, migrateCloudData } = require('./migrations')

function createMysqlStore(pool) {
  const business = createMysqlBusinessStore(pool)
  function storeError(code, message) {
    const error = new Error(message)
    error.code = code
    return error
  }

  function sqlDateTime(value) {
    return value.replace('T', ' ').replace(/Z$/, '')
  }

  function mapStudent(row, details = {}) {
    const student = {
      id: row.id,
      name: row.name,
      courseId: row.courseId || '',
      courseName: row.courseName || '',
      notes: row.notes,
      isActive: !!row.courseId,
      totalCredits: Number(row.totalCredits),
      remainingCredits: Number(row.remainingCredits),
      createdAt: row.createdAt
    }
    if (details.creditHistory) student.creditHistory = details.creditHistory
    if (details.appointments) student.appointments = details.appointments
    if (details.appointmentHistory) student.appointmentHistory = details.appointmentHistory
    return student
  }

  async function findStudentRow(ownerOpenid, studentId, runner = pool) {
    const [rows] = await runner.execute(
      `SELECT s.id, s.owner_openid AS ownerOpenid, s.course_id AS courseId,
              s.name, s.notes, s.total_credits AS totalCredits,
              s.remaining_credits AS remainingCredits,
              DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt,
              c.name AS courseName
         FROM students s
         LEFT JOIN courses c ON c.id = s.course_id AND c.owner_openid = s.owner_openid
        WHERE s.id = ? AND s.owner_openid = ?`,
      [studentId, ownerOpenid]
    )
    return rows[0] || null
  }

  async function courseBelongsTo(ownerOpenid, courseId) {
    if (!courseId) return true
    const [rows] = await pool.execute('SELECT id FROM courses WHERE id = ? AND owner_openid = ?', [courseId, ownerOpenid])
    return rows.length > 0
  }

  return {
    ...business,
    async initialize() {
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      for (const statement of schema.split(';').map(item => item.trim()).filter(Boolean)) {
        await pool.query(statement)
      }
      await pool.query('SELECT 1')
      await migrateAccountPhone(pool)
      await migrateCloudData(pool)
    },

    close() { return pool.end() },

    async listCourses(ownerOpenid) {
      const [rows] = await pool.execute(
        `SELECT id, name, description, status,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
           FROM courses WHERE owner_openid = ? ORDER BY created_at DESC`,
        [ownerOpenid]
      )
      return rows
    },

    async getCourse(ownerOpenid, courseId) {
      const [rows] = await pool.execute(
        `SELECT id, name, description, status,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
           FROM courses WHERE id = ? AND owner_openid = ?`,
        [courseId, ownerOpenid]
      )
      return rows[0] || null
    },

    async createCourse(course) {
      try {
        await pool.execute(
          `INSERT INTO courses (id, owner_openid, name, description, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [course.id, course.ownerOpenid, course.name, course.description, course.status, sqlDateTime(course.createdAt)]
        )
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw storeError('COURSE_NAME_EXISTS', 'Course name already exists')
        throw error
      }
      const { ownerOpenid, ...result } = course
      return result
    },

    async updateCourse(ownerOpenid, courseId, fields) {
      try {
        await pool.execute(
          'UPDATE courses SET name = ?, description = ? WHERE id = ? AND owner_openid = ?',
          [fields.name, fields.description, courseId, ownerOpenid]
        )
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw storeError('COURSE_NAME_EXISTS', 'Course name already exists')
        throw error
      }
      return this.getCourse(ownerOpenid, courseId)
    },

    async listStudents(ownerOpenid) {
      const [rows] = await pool.execute(
        `SELECT s.id, s.course_id AS courseId, c.name AS courseName, s.name, s.notes,
                s.total_credits AS totalCredits, s.remaining_credits AS remainingCredits,
                DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
           FROM students s
           LEFT JOIN courses c ON c.id = s.course_id AND c.owner_openid = s.owner_openid
          WHERE s.owner_openid = ? ORDER BY s.created_at DESC`,
        [ownerOpenid]
      )
      return rows.map(row => mapStudent(row))
    },

    async createStudent(student) {
      if (!(await courseBelongsTo(student.ownerOpenid, student.courseId))) {
        throw storeError('COURSE_NOT_FOUND', 'Course not found')
      }
      await pool.execute(
        `INSERT INTO students
          (id, owner_openid, course_id, name, notes, total_credits, remaining_credits, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [student.id, student.ownerOpenid, student.courseId || null, student.name, student.notes,
          student.totalCredits, student.remainingCredits, sqlDateTime(student.createdAt)]
      )
      return this.getStudent(student.ownerOpenid, student.id, false)
    },

    async getStudent(ownerOpenid, studentId, includeDetails = true) {
      return business.transaction(async connection => {
        const row = await findStudentRow(ownerOpenid, studentId, connection)
        if (!row) return null
        if (!includeDetails) return mapStudent(row)
        return mapStudent(row, await business.studentDetails(ownerOpenid, studentId, connection))
      })
    },

    async updateStudent(ownerOpenid, studentId, fields) {
      if (!(await findStudentRow(ownerOpenid, studentId))) return null
      if (!(await courseBelongsTo(ownerOpenid, fields.courseId))) {
        throw storeError('COURSE_NOT_FOUND', 'Course not found')
      }
      await pool.execute(
        'UPDATE students SET name = ?, course_id = ?, notes = ? WHERE id = ? AND owner_openid = ?',
        [fields.name, fields.courseId || null, fields.notes, studentId, ownerOpenid]
      )
      return this.getStudent(ownerOpenid, studentId, false)
    },

    async addCredits(ownerOpenid, studentId, amount, fee, record, requestId) {
      return business.mutate(ownerOpenid, requestId, `credits:${studentId}`, { amount, fee, notes: record.note }, async connection => {
        const [rows] = await connection.execute(
          'SELECT id, course_id AS courseId FROM students WHERE id = ? AND owner_openid = ? FOR UPDATE', [studentId, ownerOpenid])
        if (!rows.length) throw storeError('STUDENT_NOT_FOUND', 'Student not found')
        await connection.execute(
          'UPDATE students SET total_credits = total_credits + ?, remaining_credits = remaining_credits + ? WHERE id = ? AND owner_openid = ?',
          [amount, amount, studentId, ownerOpenid])
        await connection.execute(`INSERT INTO student_credits (id, owner_openid, student_id, amount, fee, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [record.id, ownerOpenid, studentId, amount, fee, record.note, sqlDateTime(record.time)])
        await connection.execute(`INSERT INTO credit_ledger (id, owner_openid, student_id, delta, kind, title, notes, created_at)
          VALUES (?, ?, ?, ?, 'grant', ?, ?, ?)`, [record.id, ownerOpenid, studentId, amount, record.title, record.note, sqlDateTime(record.time)])
        if (fee > 0) {
          const [courses] = await connection.execute('SELECT name FROM courses WHERE id = ? AND owner_openid = ?', [rows[0].courseId || '', ownerOpenid])
          await connection.execute(`INSERT INTO payments (id, owner_openid, student_id, grant_id, course_id, course_name, amount, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [record.id, ownerOpenid, studentId, record.id, rows[0].courseId, courses[0] ? courses[0].name : '', fee, sqlDateTime(record.time)])
        }
        // Return the committed operation identity; details are loaded after the transaction.
        return { record }
      }).then(async result => ({ ...result, student: await this.getStudent(ownerOpenid, studentId, true) }))
    },

    async addAppointment(ownerOpenid, studentId, appointment, record, requestId) {
      const { session } = await business.createSession(ownerOpenid, {
        date: appointment.date, start: appointment.start, end: appointment.end,
        endDate: appointment.endDate, notes: appointment.notes
      }, requestId, studentId)
      return { student: await this.getStudent(ownerOpenid, studentId, true), appointment: session, record: session.history[0] }
    }
  }
}

module.exports = { createMysqlStore }
