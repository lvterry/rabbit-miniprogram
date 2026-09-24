const { randomUUID } = require('node:crypto')
const express = require('express')
const { createMemoryStore } = require('./memory-store')

function createApp({ store = createMemoryStore() } = {}) {
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

  app.get('/courses', requireWeChatUser, async (req, res) => {
    res.json({ courses: await store.listCourses(req.ownerOpenid) })
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

  app.post('/students/:studentId/credits', requireWeChatUser, async (req, res) => {
    const { amount, fee = 0, notes = '' } = req.body || {}
    const creditAmount = Number(amount)
    const creditFee = Number(fee)
    if (!Number.isInteger(creditAmount) || creditAmount < 1 || creditAmount > 1000 ||
        !Number.isFinite(creditFee) || creditFee < 0 || typeof notes !== 'string' || notes.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid credit fields' })
    }
    const record = {
      id: randomUUID(),
      time: new Date().toISOString(),
      title: `添加 ${creditAmount} 次课时`,
      detail: creditFee ? `费用：¥${creditFee}` : '未填写费用',
      note: notes.trim()
    }
    const result = await store.addCredits(req.ownerOpenid, req.params.studentId, creditAmount, creditFee, record)
    if (!result) return res.status(404).json({ error: 'Student not found' })
    res.status(201).json(result)
  })

  app.post('/students/:studentId/appointments', requireWeChatUser, async (req, res) => {
    const { date, start, end, endDate = '', notes = '' } = req.body || {}
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
    if (typeof date !== 'string' || !datePattern.test(date) || typeof start !== 'string' || !timePattern.test(start) ||
        typeof end !== 'string' || !timePattern.test(end) || typeof endDate !== 'string' ||
        (endDate && !datePattern.test(endDate)) || typeof notes !== 'string' || notes.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid appointment fields' })
    }
    const appointmentEndDate = endDate || date
    const isValidDate = value => {
      const [year, month, day] = value.split('-').map(Number)
      const parsed = new Date(Date.UTC(year, month - 1, day))
      return parsed.toISOString().slice(0, 10) === value
    }
    if (!isValidDate(date) || !isValidDate(appointmentEndDate)) {
      return res.status(400).json({ error: 'Invalid appointment date' })
    }
    const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3))
    const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3))
    const toUtcDay = value => Date.UTC(...value.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)))
    const dayDifference = (toUtcDay(appointmentEndDate) - toUtcDay(date)) / 86400000
    const duration = dayDifference * 1440 + endMinutes - startMinutes
    if (dayDifference < 0 || dayDifference > 1 || duration <= 0 || duration > 1440) {
      return res.status(400).json({ error: 'Invalid appointment time range' })
    }

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
    const result = await store.addAppointment(req.ownerOpenid, req.params.studentId, appointment, record)
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
    console.error('Request failed:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}

module.exports = { createApp }
