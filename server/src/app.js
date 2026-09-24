const { randomUUID } = require('node:crypto')
const express = require('express')

function createApp() {
  const app = express()
  const courses = []
  const students = []

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

  app.get('/courses', requireWeChatUser, (req, res) => {
    res.json({
      courses: courses
        .filter(course => course.ownerOpenid === req.ownerOpenid)
        .map(({ ownerOpenid, ...course }) => course)
    })
  })

  app.post('/courses', requireWeChatUser, (req, res) => {
    const { name, description = '' } = req.body || {}
    if (typeof name !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedDescription.length > 500) {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    if (courses.some(course => course.ownerOpenid === req.ownerOpenid && course.name === trimmedName)) {
      return res.status(409).json({ error: 'Course name already exists' })
    }

    const course = {
      id: randomUUID(),
      name: trimmedName,
      description: trimmedDescription,
      status: 'active',
      createdAt: new Date().toISOString()
    }
    courses.push({ ...course, ownerOpenid: req.ownerOpenid })
    res.status(201).json(course)
  })

  function publicStudent(student, includeDetails = false) {
    const course = courses.find(item => item.id === student.courseId)
    const { ownerOpenid, creditHistory, appointments, appointmentHistory, ...fields } = student
    const result = { ...fields, courseName: course ? course.name : '', isActive: !!course }
    if (includeDetails) {
      result.creditHistory = creditHistory
      result.appointments = appointments
      result.appointmentHistory = appointmentHistory
    }
    return result
  }

  function requireOwnedStudent(req, res, next) {
    const student = students.find(item => item.id === req.params.studentId && item.ownerOpenid === req.ownerOpenid)
    if (!student) return res.status(404).json({ error: 'Student not found' })
    req.student = student
    next()
  }

  app.get('/students', requireWeChatUser, (req, res) => {
    res.json({ students: students.filter(student => student.ownerOpenid === req.ownerOpenid).map(publicStudent) })
  })

  app.post('/students', requireWeChatUser, (req, res) => {
    const { name, courseId = '', notes = '' } = req.body || {}
    if (typeof name !== 'string' || typeof courseId !== 'string' || typeof notes !== 'string') {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    const trimmedName = name.trim()
    const trimmedNotes = notes.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedNotes.length > 200) {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    if (courseId && !courses.some(item => item.id === courseId && item.ownerOpenid === req.ownerOpenid)) {
      return res.status(404).json({ error: 'Course not found' })
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
    students.unshift(student)
    res.status(201).json(publicStudent(student))
  })

  app.get('/students/:studentId', requireWeChatUser, requireOwnedStudent, (req, res) => {
    res.json({ student: publicStudent(req.student, true) })
  })

  app.patch('/students/:studentId', requireWeChatUser, requireOwnedStudent, (req, res) => {
    const { name, courseId = '', notes = '' } = req.body || {}
    if (typeof name !== 'string' || typeof courseId !== 'string' || typeof notes !== 'string') {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    const trimmedName = name.trim()
    const trimmedNotes = notes.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedNotes.length > 300) {
      return res.status(400).json({ error: 'Invalid student fields' })
    }
    if (courseId && !courses.some(item => item.id === courseId && item.ownerOpenid === req.ownerOpenid)) {
      return res.status(404).json({ error: 'Course not found' })
    }
    req.student.name = trimmedName
    req.student.courseId = courseId
    req.student.notes = trimmedNotes
    res.json({ student: publicStudent(req.student) })
  })

  app.post('/students/:studentId/credits', requireWeChatUser, requireOwnedStudent, (req, res) => {
    const { amount, fee = 0, notes = '' } = req.body || {}
    const creditAmount = Number(amount)
    const creditFee = Number(fee)
    if (!Number.isInteger(creditAmount) || creditAmount < 1 || creditAmount > 1000 ||
        !Number.isFinite(creditFee) || creditFee < 0 || typeof notes !== 'string' || notes.trim().length > 200) {
      return res.status(400).json({ error: 'Invalid credit fields' })
    }
    const student = req.student
    student.totalCredits += creditAmount
    student.remainingCredits += creditAmount
    const record = {
      id: randomUUID(),
      time: new Date().toISOString(),
      title: `添加 ${creditAmount} 次课时`,
      detail: creditFee ? `费用：¥${creditFee}` : '未填写费用',
      note: notes.trim()
    }
    student.creditHistory.unshift(record)
    res.status(201).json({ student: publicStudent(student, true), record })
  })

  app.post('/students/:studentId/appointments', requireWeChatUser, requireOwnedStudent, (req, res) => {
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

    const student = req.student
    const appointment = {
      id: randomUUID(), date, start, end, endDate: appointmentEndDate === date ? '' : appointmentEndDate,
      notes: notes.trim(), status: 'scheduled', createdAt: new Date().toISOString()
    }
    student.appointments.push(appointment)
    student.appointments.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    const record = {
      id: appointment.id,
      time: appointment.createdAt,
      title: '添加预约',
      detail: `${date} ${start}–${appointmentEndDate === date ? end : `次日 ${end}`}`,
      note: notes.trim()
    }
    student.appointmentHistory.unshift(record)
    res.status(201).json({ student: publicStudent(student, true), appointment, record })
  })

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' })
    }
    console.error('Request failed:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}

module.exports = { createApp }
