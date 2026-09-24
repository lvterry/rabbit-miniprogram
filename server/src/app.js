const { randomUUID } = require('node:crypto')
const express = require('express')

function createApp({ teacherOpenid = '' } = {}) {
  const app = express()
  const courses = []

  app.use(express.json())

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'rabbit-api' })
  })

  function requireTeacher(req, res, next) {
    const openid = req.get('x-wx-openid')
    if (!req.get('x-wx-source') || !openid) {
      return res.status(401).json({ error: 'WeChat identity required' })
    }
    if (!teacherOpenid) {
      return res.status(503).json({ error: 'Teacher account not configured' })
    }
    if (openid !== teacherOpenid) {
      return res.status(403).json({ error: 'Teacher access required' })
    }
    req.teacherOpenid = openid
    next()
  }

  app.get('/courses', requireTeacher, (req, res) => {
    res.json({
      courses: courses
        .filter(course => course.teacherOpenid === req.teacherOpenid)
        .map(({ teacherOpenid, ...course }) => course)
    })
  })

  app.post('/courses', requireTeacher, (req, res) => {
    const { name, description = '' } = req.body || {}
    if (typeof name !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName || trimmedName.length > 40 || trimmedDescription.length > 500) {
      return res.status(400).json({ error: 'Invalid course fields' })
    }
    if (courses.some(course => course.teacherOpenid === req.teacherOpenid && course.name === trimmedName)) {
      return res.status(409).json({ error: 'Course name already exists' })
    }

    const course = {
      id: randomUUID(),
      name: trimmedName,
      description: trimmedDescription,
      status: 'active',
      createdAt: new Date().toISOString()
    }
    courses.push({ ...course, teacherOpenid: req.teacherOpenid })
    res.status(201).json(course)
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
