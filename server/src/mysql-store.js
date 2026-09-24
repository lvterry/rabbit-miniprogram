const fs = require('node:fs')
const path = require('node:path')

function createMysqlStore(pool) {
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

  async function findStudentRow(ownerOpenid, studentId) {
    const [rows] = await pool.execute(
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
    async initialize() {
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      for (const statement of schema.split(';').map(item => item.trim()).filter(Boolean)) {
        await pool.query(statement)
      }
      await pool.query('SELECT 1')
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
      const row = await findStudentRow(ownerOpenid, studentId)
      if (!row) return null
      if (!includeDetails) return mapStudent(row)

      const [creditRows] = await pool.execute(
        `SELECT id, amount, fee, notes,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS time
           FROM student_credits WHERE owner_openid = ? AND student_id = ?
          ORDER BY created_at DESC, id DESC`,
        [ownerOpenid, studentId]
      )
      const creditHistory = creditRows.map(record => ({
        id: record.id,
        time: record.time,
        title: `添加 ${Number(record.amount)} 次课时`,
        detail: Number(record.fee) ? `费用：¥${Number(record.fee)}` : '未填写费用',
        note: record.notes
      }))

      const [appointmentRows] = await pool.execute(
        `SELECT id,
                DATE_FORMAT(appointment_date, '%Y-%m-%d') AS date,
                DATE_FORMAT(start_time, '%H:%i') AS start,
                IFNULL(DATE_FORMAT(end_date, '%Y-%m-%d'), '') AS endDate,
                DATE_FORMAT(end_time, '%H:%i') AS end,
                notes, status,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
           FROM student_appointments WHERE owner_openid = ? AND student_id = ?
          ORDER BY appointment_date, start_time, id`,
        [ownerOpenid, studentId]
      )
      const appointments = appointmentRows.map(record => ({ ...record }))
      const appointmentHistory = [...appointmentRows]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(record => ({
          id: record.id,
          time: record.createdAt,
          title: '添加预约',
          detail: `${record.date} ${record.start}–${record.endDate ? `次日 ${record.end}` : record.end}`,
          note: record.notes
        }))

      return mapStudent(row, { creditHistory, appointments, appointmentHistory })
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

    async addCredits(ownerOpenid, studentId, amount, fee, record) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute(
          'SELECT id FROM students WHERE id = ? AND owner_openid = ? FOR UPDATE',
          [studentId, ownerOpenid]
        )
        if (!rows.length) throw storeError('STUDENT_NOT_FOUND', 'Student not found')
        await connection.execute(
          'UPDATE students SET total_credits = total_credits + ?, remaining_credits = remaining_credits + ? WHERE id = ? AND owner_openid = ?',
          [amount, amount, studentId, ownerOpenid]
        )
        await connection.execute(
          `INSERT INTO student_credits (id, owner_openid, student_id, amount, fee, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [record.id, ownerOpenid, studentId, amount, fee, record.note, sqlDateTime(record.time)]
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback().catch(() => {})
        throw error
      } finally {
        connection.release()
      }
      return { student: await this.getStudent(ownerOpenid, studentId, true), record }
    },

    async addAppointment(ownerOpenid, studentId, appointment, record) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute(
          'SELECT id FROM students WHERE id = ? AND owner_openid = ? FOR UPDATE',
          [studentId, ownerOpenid]
        )
        if (!rows.length) throw storeError('STUDENT_NOT_FOUND', 'Student not found')
        await connection.execute(
          `INSERT INTO student_appointments
            (id, owner_openid, student_id, appointment_date, start_time, end_date, end_time, notes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [appointment.id, ownerOpenid, studentId, appointment.date, `${appointment.start}:00`,
            appointment.endDate || null, `${appointment.end}:00`, appointment.notes, appointment.status,
            sqlDateTime(appointment.createdAt)]
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback().catch(() => {})
        throw error
      } finally {
        connection.release()
      }
      return { student: await this.getStudent(ownerOpenid, studentId, true), appointment, record }
    }
  }
}

module.exports = { createMysqlStore }
