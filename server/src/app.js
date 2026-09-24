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

  function publicStudent(student) {
    const course = courses.find(item => item.id === student.courseId)
    const { ownerOpenid, ...fields } = student
    return { ...fields, courseName: course ? course.name : '', isActive: !!course }
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
      createdAt: new Date().toISOString(),
      ownerOpenid: req.ownerOpenid
    }
    students.unshift(student)
    res.status(201).json(publicStudent(student))
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
