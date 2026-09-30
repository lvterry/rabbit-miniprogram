const { accountProfile } = require('./account-profile')
// Test adapter only. Production startup always supplies the MySQL store.
const { domainError, fingerprint, financialReport, sessionView, sessionTransition, randomUUID, businessDate } = require('./domain')

function createMemoryStore() {
  const courses = [], students = [], sessions = [], payments = []
  const accounts = new Map(), requests = new Map()
  const findCourse = (owner, id) => courses.find(item => item.ownerOpenid === owner && item.id === id)
  const findStudent = (owner, id) => students.find(item => item.ownerOpenid === owner && item.id === id)
  const publicCourse = ({ ownerOpenid, ...fields }) => ({ ...fields })

  function mutate(owner, key, scope, fields, work) {
    const identity = `${owner}:${key}`, hash = fingerprint(scope, fields)
    if (key && requests.has(identity)) {
      const previous = requests.get(identity)
      if (previous.hash !== hash) throw domainError('IDEMPOTENCY_CONFLICT', 'Request key was used for different fields')
      return structuredClone(previous.result)
    }
    const result = work()
    if (key) requests.set(identity, { hash, result: structuredClone(result) })
    return result
  }

  function viewSession(session) {
    const { ownerOpenid, bookings, history, ...fields } = session
    const course = findCourse(ownerOpenid, session.courseId)
    return sessionView({ ...fields, title: course ? course.name : session.title }, bookings.map(booking => ({
      ...booking, name: findStudent(ownerOpenid, booking.studentId).name,
      remainingCredits: findStudent(ownerOpenid, booking.studentId).remainingCredits
    })), history)
  }

  function publicStudent(student, details = false) {
    const { ownerOpenid, creditHistory, appointments, appointmentHistory, ...fields } = student
    const course = findCourse(ownerOpenid, student.courseId)
    const result = { ...fields, courseName: course ? course.name : '', isActive: !!course }
    if (details) Object.assign(result, { creditHistory, appointmentHistory, appointments: sessions
      .filter(session => session.ownerOpenid === ownerOpenid && session.bookings.some(b => b.studentId === student.id))
      .map(viewSession).sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`)) })
    return structuredClone(result)
  }

  function validateCourse(owner, id) {
    if (id && !findCourse(owner, id)) throw domainError('COURSE_NOT_FOUND', 'Course not found')
  }

  return {
    async initialize() {}, async close() {},
    async listCourses(owner) { return courses.filter(item => item.ownerOpenid === owner).map(publicCourse) },
    async getCourse(owner, id) { const course = findCourse(owner, id); return course ? publicCourse(course) : null },
    async createCourse(course) {
      if (courses.some(item => item.ownerOpenid === course.ownerOpenid && item.name === course.name)) throw domainError('COURSE_NAME_EXISTS', 'Course name already exists')
      courses.push(course); return publicCourse(course)
    },
    async updateCourse(owner, id, fields) {
      const course = findCourse(owner, id)
      if (!course) return null
      if (courses.some(item => item.ownerOpenid === owner && item.id !== id && item.name === fields.name)) throw domainError('COURSE_NAME_EXISTS', 'Course name already exists')
      Object.assign(course, fields); return publicCourse(course)
    },
    async listStudents(owner) { return students.filter(item => item.ownerOpenid === owner).map(item => publicStudent(item)) },
    async createStudent(student) { validateCourse(student.ownerOpenid, student.courseId); students.unshift(student); return publicStudent(student) },
    async getStudent(owner, id, details = true) { const student = findStudent(owner, id); return student ? publicStudent(student, details) : null },
    async updateStudent(owner, id, fields) {
      const student = findStudent(owner, id)
      if (!student) return null
      validateCourse(owner, fields.courseId); Object.assign(student, fields); return publicStudent(student)
    },
    async addCredits(owner, id, amount, fee, record, key) {
      return mutate(owner, key, `credits:${id}`, { amount, fee, notes: record.note }, () => {
        const student = findStudent(owner, id)
        if (!student) throw domainError('STUDENT_NOT_FOUND', 'Student not found')
        student.totalCredits += amount; student.remainingCredits += amount; student.creditHistory.unshift(record)
        if (fee) payments.push({ owner, courseId: student.courseId, courseName: (findCourse(owner, student.courseId) || {}).name || '', amount: fee, date: businessDate() })
        return { student: publicStudent(student, true), record }
      })
    },
    async addAppointment(owner, id, appointment, record, key) {
      const { session } = await this.createSession(owner, { date: appointment.date, start: appointment.start, end: appointment.end,
        endDate: appointment.endDate, notes: appointment.notes }, key, id)
      return { student: publicStudent(findStudent(owner, id), true), appointment: session, record: session.history[0] }
    },
    async createSession(owner, fields, key, studentId) {
      return mutate(owner, key, 'createSession', { ...fields, studentId }, () => {
        const selected = (studentId ? [studentId] : fields.studentIds).map(id => findStudent(owner, id))
        if (selected.some(student => !student)) throw domainError('STUDENT_NOT_FOUND', 'Student not found')
        const courseId = fields.courseId || selected[0].courseId
        if (!courseId) throw domainError('COURSE_REQUIRED', 'Select a course before scheduling')
        validateCourse(owner, courseId)
        if (selected.some(student => student.courseId !== courseId)) throw domainError('ENROLLMENT_REQUIRED', 'Students must be associated with this course')
        const record = { id: randomUUID(), time: new Date().toISOString(), title: '添加预约', note: fields.notes || '', version: 0, action: 'create' }
        const session = { id: randomUUID(), ownerOpenid: owner, courseId, title: findCourse(owner, courseId).name,
          date: fields.date, start: fields.start, end: fields.end, endDate: fields.endDate || '', note: fields.notes || '',
          status: 'scheduled', version: 0, createdAt: record.time,
          bookings: selected.map(student => ({ id: randomUUID(), studentId: student.id, creditConsumed: false })), history: [record] }
        sessions.push(session)
        selected.forEach(student => student.appointmentHistory.unshift({ ...record, detail: `${session.date} ${session.start}–${session.end}` }))
        return { session: viewSession(session) }
      })
    },
    async listSessions(owner, from, to) {
      return sessions.filter(session => session.ownerOpenid === owner && session.date >= from && session.date <= to)
        .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`)).map(viewSession)
    },
    async getSession(owner, id) { const session = sessions.find(item => item.id === id && item.ownerOpenid === owner); return session ? viewSession(session) : null },
    async changeSession(owner, id, fields, key) {
      return mutate(owner, key, `session:${id}`, fields, () => {
        const session = sessions.find(item => item.id === id && item.ownerOpenid === owner)
        if (!session) throw domainError('SESSION_NOT_FOUND', 'Session not found')
        const { next, consumed, title } = sessionTransition(viewSession(session), fields)
        if (session.bookings.some(b => consumed && !b.creditConsumed && findStudent(owner, b.studentId).remainingCredits < 1)) throw domainError('INSUFFICIENT_CREDITS', 'Add credits before consuming a lesson')
        const event = { id: randomUUID(), time: new Date().toISOString(), title, note: fields.actionNote || '', version: next.version, action: fields.action }
        session.bookings.forEach(booking => {
          const student = findStudent(owner, booking.studentId), delta = Number(booking.creditConsumed) - Number(consumed)
          if (delta) { student.remainingCredits += delta; student.creditHistory.unshift({ id: randomUUID(), time: event.time, title, detail: `${delta > 0 ? '+' : ''}${delta} 次`, note: event.note }) }
          booking.creditConsumed = consumed
          student.appointmentHistory.unshift({ ...event, detail: `${next.date} ${next.start}–${next.end}` })
        })
        Object.assign(session, { date: next.date, start: next.start, end: next.end, endDate: next.endDate, note: next.note, status: next.status, version: next.version })
        session.history.unshift(event); return { session: viewSession(session) }
      })
    },
    async getProfile(owner) {
      if (!accounts.has(owner)) accounts.set(owner, { id: randomUUID(), phoneNumber: '', createdAt: new Date().toISOString() })
      return accountProfile(accounts.get(owner))
    },
    async bindPhone(owner, phone) {
      await this.getProfile(owner)
      Object.assign(accounts.get(owner), phone)
      return accountProfile(accounts.get(owner))
    },
    async addFeedback(owner, message, key) { return mutate(owner, key, 'feedback', { message }, () => ({ feedback: { id: randomUUID(), message, createdAt: new Date().toISOString() } })) },
    async getFinancialReport(owner) { return financialReport(payments.filter(payment => payment.owner === owner).map(payment => ({ ...payment, courseName: (findCourse(owner, payment.courseId) || {}).name || payment.courseName }))) }
  }
}

module.exports = { createMemoryStore }
