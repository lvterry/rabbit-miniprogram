const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')

const teacherHeaders = { 'x-wx-source': 'test', 'x-wx-openid': 'teacher-one' }

async function withServer(app, run) {
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  try {
    const address = server.address()
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('health and unknown routes keep their JSON responses', async () => {
  await withServer(createApp(), async baseUrl => {
    const health = await fetch(`${baseUrl}/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, service: 'rabbit-api' })

    const missing = await fetch(`${baseUrl}/missing`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { error: 'Not Found' })
  })
})

test('only the configured WeChat teacher can create and list courses', async () => {
  await withServer(createApp({ teacherOpenid: 'teacher-one' }), async baseUrl => {
    const create = (headers, body) => fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
    assert.equal((await create({}, { name: '西语入门' })).status, 401)
    assert.equal((await create({ 'x-wx-openid': 'teacher-one' }, { name: '西语入门' })).status, 401)
    assert.equal((await create({ ...teacherHeaders, 'x-wx-openid': 'other' }, { name: '西语入门' })).status, 403)

    const created = await create(teacherHeaders, {
      name: ' 西语入门 ', description: ' 初级课程 ', teacherOpenid: 'other'
    })
    assert.equal(created.status, 201)
    const course = await created.json()
    assert.match(course.id, /^[0-9a-f-]{36}$/)
    assert.equal(course.name, '西语入门')
    assert.equal(course.description, '初级课程')
    assert.equal(course.status, 'active')
    assert.equal(typeof course.createdAt, 'string')
    assert.equal('teacherOpenid' in course, false)

    const listed = await fetch(`${baseUrl}/courses`, { headers: teacherHeaders })
    assert.equal(listed.status, 200)
    assert.deepEqual(await listed.json(), { courses: [course] })
    assert.equal((await fetch(`${baseUrl}/courses`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/courses`, {
      headers: { ...teacherHeaders, 'x-wx-openid': 'other' }
    })).status, 403)

    assert.equal((await create(teacherHeaders, { name: '西语入门' })).status, 409)
    assert.equal((await create(teacherHeaders, { name: ' ' })).status, 400)
    assert.equal((await create(teacherHeaders, { name: 'x'.repeat(41) })).status, 400)
    assert.equal((await create(teacherHeaders, { name: '新课', description: 'x'.repeat(501) })).status, 400)

    const invalidJson = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...teacherHeaders },
      body: '{'
    })
    assert.equal(invalidJson.status, 400)
    assert.deepEqual(await invalidJson.json(), { error: 'Invalid JSON' })
  })
})

test('course routes require a configured teacher account', async () => {
  await withServer(createApp(), async baseUrl => {
    const response = await fetch(`${baseUrl}/courses`, { headers: teacherHeaders })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'Teacher account not configured' })
  })
})

test('debug endpoint returns only the calling WeChat identity', async () => {
  await withServer(createApp(), async baseUrl => {
    assert.equal((await fetch(`${baseUrl}/debug/openid`)).status, 401)
    const response = await fetch(`${baseUrl}/debug/openid`, { headers: teacherHeaders })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { openid: 'teacher-one' })
  })
})
