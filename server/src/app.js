const { exchangePhoneCode: defaultPhoneExchange } = require('./wechat-phone')
const { randomUUID } = require('node:crypto')
const express = require('express')
const { createMemoryStore } = require('./memory-store')
const { businessDate, validRange, operationKey } = require('./domain')

function createApp({ store = createMemoryStore(), exchangePhoneCode = defaultPhoneExchange } = {}) {
  const app = express()

  app.use(express.json())

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'rabbit-api' })
  })

  function requireWeChatUser(req, res, next) {
    const openid = req.get('x-wx-openid')
    if (!req.get('x-wx-source') || !openid) {
      return res.status(401).json({ error: 'WeChat identity required' })
    }
    req.ownerOpenid = openid
    next()
  }

  function optionalRequestKey(req, res, next) {
    const { requestId } = req.body || {}
    if (requestId !== undefined && !operationKey(requestId)) return res.status(400).json({ error: 'Invalid request key' })
    next()
  }

  function requireRequestKey(req, res, next) {
    if (!operationKey((req.body || {}).requestId)) return res.status(400).json({ error: 'Request key required' })
    next()
  }

  app.get('/me', requireWeChatUser, async (req, res) => {
    res.json({ profile: await store.getProfile(req.ownerOpenid) })
  })

  app.delete('/me/data', requireWeChatUser, async (req, res) => {
    await store.clearUserData(req.ownerOpenid)
    res.json({ ok: true })
  })

  app.post('/me/phone', requireWeChatUser, async (req, res) => {
    const { code } = req.body || {}
    if (typeof code !== 'string' || !code.trim() || code.length > 256) return res.status(400).json({ error: 'Invalid authorization code' })
    const phone = await exchangePhoneCode(code)
    res.json({ profile: await store.bindPhone(req.ownerOpenid, phone) })
  })

  app.post('/feedback', requireWeChatUser, requireRequestKey, async (req, res) => {
    const { message, requestId } = req.body
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 500) return res.status(400).json({ error: 'Invalid feedback fields' })
    res.status(201).json(await store.addFeedback(req.ownerOpenid, message.trim(), requestId))
  })

  app.get('/reports/revenue', requireWeChatUser, async (req, res) => {
    res.json({ report: await store.getFinancialReport(req.ownerOpenid) })
  })

  app.get('/sessions', requireWeChatUser, async (req, res) => {
    const from = req.query.from || businessDate()
    const to = req.query.to || '9999-12-31'
    const validDate = value => validRange({ date: value, start: '00:00', end: '00:01' }, { future: false })
    if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ error: 'Invalid date range' })
    res.json({ sessions: await store.listSessions(req.ownerOpenid, from, to) })
  })

  app.get('/sessions/:sessionId', requireWeChatUser, async (req, res) => {
    const session = await store.getSession(req.ownerOpenid, req.params.sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found' })
    res.json({ session })
  })

  app.post('/sessions', requireWeChatUser, requireRequestKey, async (req, res) => {
    const { courseId, studentIds, date, start, end, endDate = '', notes = '', requestId } = req.body
    if (typeof courseId !== 'string' || !courseId || !Array.isArray(studentIds) || !studentIds.length || studentIds.length > 100 ||
        studentIds.some(id => typeof id !== 'string' || !id) || new Set(studentIds).size !== studentIds.length ||
        !validRange({ date, start, end, endDate }) || typeof notes !== 'string' || notes.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid session fields' })
    }
    res.status(201).json(await store.createSession(req.ownerOpenid, { courseId, studentIds, date, start, end, endDate: endDate === date ? '' : endDate, notes: notes.trim() }, requestId))
  })

  app.post('/sessions/:sessionId/actions', requireWeChatUser, requireRequestKey, async (req, res) => {
    const { action, version, consumeCredit = false, actionNote = '', note = '', requestId } = req.body
    if (!['reschedule', 'cancel', 'restore', 'complete', 'uncomplete', 'editNote'].includes(action) ||
        !Number.isSafeInteger(version) || version < 0 || typeof consumeCredit !== 'boolean' ||
        typeof actionNote !== 'string' || actionNote.trim().length > 200 || typeof note !== 'string' || note.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid session action' })
    }
    const fields = { action, version, consumeCredit, actionNote: actionNote.trim(), note: note.trim() }
    if (action === 'reschedule') {
      const { date, start, end, endDate = '' } = req.body
      if (!validRange({ date, start, end, endDate })) return res.status(400).json({ error: 'Invalid appointment fields' })
      Object.assign(fields, { date, start, end, endDate: endDate === date ? '' : endDate })
    }
    res.json(await store.changeSession(req.ownerOpenid, req.params.sessionId, fields, requestId))
  })

  app.get('/courses', requireWeChatUser, async (req, res) => {
    res.json({ courses: await store.listCourses(req.ownerOpenid) })
  })

  app.get('/courses/:courseId', requireWeChatUser, async (req, res) => {
    const course = await store.getCourse(req.ownerOpenid, req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    res.json({ course })
  })

  app.post('/courses', requireWeChatUser, async (req, res) => {
    const { name, description = '' } = req.body || {}
    if (typeof name !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedDescription.length > 500) {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    const course = {
      id: randomUUID(),
      name: trimmedName,
      description: trimmedDescription,
      status: 'active',
      createdAt: new Date().toISOString()
    }
    const created = await store.createCourse({ ...course, ownerOpenid: req.ownerOpenid })
    res.status(201).json(created)
  })

  app.patch('/courses/:courseId', requireWeChatUser, async (req, res) => {
    const { name, description = '' } = req.body || {}
    if (typeof name !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedDescription.length > 500) {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    const course = await store.updateCourse(req.ownerOpenid, req.params.courseId, {
      name: trimmedName, description: trimmedDescription
    })
    if (!course) return res.status(404).json({ error: 'Course not found' })
    res.json({ course })
  })

  app.get('/students', requireWeChatUser, async (req, res) => {
    res.json({ students: await store.listStudents(req.ownerOpenid) })
  })

  app.post('/students', requireWeChatUser, async (req, res) => {
    const { name, courseId = '', notes = '' } = req.body || {}
    if (typeof name !== 'string' || typeof courseId !== 'string' || typeof notes !== 'string') {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    const trimmedName = name.trim()
    const trimmedNotes = notes.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedNotes.length > 200) {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    const student = {
      id: randomUUID(),
      name: trimmedName,
      courseId,
      notes: trimmedNotes,
      totalCredits: 0,
      remainingCredits: 0,
      creditHistory: [],
      appointments: [],
      appointmentHistory: [],
      createdAt: new Date().toISOString(),
      ownerOpenid: req.ownerOpenid
    }
    student.avatar = { style: 'geometric', version: 1, seed: student.id }
    res.status(201).json(await store.createStudent(student))
  })

  app.get('/students/:studentId', requireWeChatUser, async (req, res) => {
    const student = await store.getStudent(req.ownerOpenid, req.params.studentId, true)
    if (!student) return res.status(404).json({ error: 'Student not found' })
    res.json({ student })
  })

  app.patch('/students/:studentId', requireWeChatUser, async (req, res) => {
    const { name, courseId = '', notes = '' } = req.body || {}
    if (typeof name !== 'string' || typeof courseId !== 'string' || typeof notes !== 'string') {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    const trimmedName = name.trim()
    const trimmedNotes = notes.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedNotes.length > 300) {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    const student = await store.updateStudent(req.ownerOpenid, req.params.studentId, {
      name: trimmedName, courseId, notes: trimmedNotes
    })
    if (!student) return res.status(404).json({ error: 'Student not found' })
    res.json({ student })
  })

  app.post('/students/:studentId/credits', requireWeChatUser, optionalRequestKey, async (req, res) => {
    const { amount, fee = 0, notes = '' } = req.body || {}
    const creditAmount = Number(amount)
    const creditFee = Number(fee)
    if (!Number.isInteger(creditAmount) || creditAmount < 1 || creditAmount > 1000 ||
        !Number.isFinite(creditFee) || creditFee < 0 || creditFee > 99999999.99 || Math.abs(creditFee * 100 - Math.round(creditFee * 100)) > 0.000001 || typeof notes !== 'string' || notes.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid credit fields' })
    }
    const record = {
      id: randomUUID(),
      time: new Date().toISOString(),
      title: `添加 ${creditAmount} 次课时`,
      detail: creditFee ? `费用：¥${creditFee}` : '未填写费用',
      note: notes.trim()
    }
    const result = await store.addCredits(req.ownerOpenid, req.params.studentId, creditAmount, creditFee, record, req.body.requestId)
    if (!result) return res.status(404).json({ error: 'Student not found' })
    res.status(201).json(result)
  })

  app.post('/students/:studentId/appointments', requireWeChatUser, optionalRequestKey, async (req, res) => {
    const { date, start, end, endDate = '', notes = '' } = req.body || {}
    if (!validRange({ date, start, end, endDate }) || typeof notes !== 'string' || notes.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid appointment fields' })
    }
    const appointmentEndDate = endDate || date
    const appointment = {
      id: randomUUID(), date, start, end, endDate: appointmentEndDate === date ? '' : appointmentEndDate,
      notes: notes.trim(), status: 'scheduled', createdAt: new Date().toISOString()
    }
    const record = {
      id: appointment.id,
      time: appointment.createdAt,
      title: '添加预约',
      detail: `${date} ${start}–${appointmentEndDate === date ? end : `次日 ${end}`}`,
      note: notes.trim()
    }
    const result = await store.addAppointment(req.ownerOpenid, req.params.studentId, appointment, record, req.body.requestId)
    if (!result) return res.status(404).json({ error: 'Student not found' })
    res.status(201).json(result)
  })

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' })
    }
    if (error.code === 'COURSE_NAME_EXISTS') return res.status(409).json({ error: 'Course name already exists' })
    if (error.code === 'COURSE_NOT_FOUND') return res.status(404).json({ error: 'Course not found' })
    if (error.code === 'STUDENT_NOT_FOUND') return res.status(404).json({ error: 'Student not found' })
    const statusByCode = { SESSION_NOT_FOUND: 404, SESSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
      INSUFFICIENT_CREDITS: 409, COURSE_REQUIRED: 400, ENROLLMENT_REQUIRED: 400, INVALID_RANGE: 400, PHONE_AUTH_INVALID: 400, PHONE_SERVICE_UNAVAILABLE: 503 }
    if (statusByCode[error.code]) return res.status(statusByCode[error.code]).json({ error: error.message, code: error.code })
    console.error('Request failed:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}

module.exports = { createApp }
