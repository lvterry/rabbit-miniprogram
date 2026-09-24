const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')

const userOneHeaders = { 'x-wx-source': 'test', 'x-wx-openid': 'user-one' }
const userTwoHeaders = { 'x-wx-source': 'test', 'x-wx-openid': 'user-two' }

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

test('WeChat users can create courses without an allowlist and only list their own', async () => {
  await withServer(createApp(), async baseUrl => {
    const create = (headers, body) => fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
    assert.equal((await create({}, { name: '西语入门' })).status, 401)
    assert.equal((await create({ 'x-wx-openid': 'user-one' }, { name: '西语入门' })).status, 401)
    assert.equal((await create({ 'x-wx-source': 'test' }, { name: '西语入门' })).status, 401)

    const created = await create(userOneHeaders, {
      name: ' 西语入门 ', description: ' 初级课程 ', ownerOpenid: 'user-two'
    })
    assert.equal(created.status, 201)
    const course = await created.json()
    assert.match(course.id, /^[0-9a-f-]{36}$/)
    assert.equal(course.name, '西语入门')
    assert.equal(course.description, '初级课程')
    assert.equal(course.status, 'active')
    assert.equal(typeof course.createdAt, 'string')
    assert.equal('ownerOpenid' in course, false)

    const listed = await fetch(`${baseUrl}/courses`, { headers: userOneHeaders })
    assert.equal(listed.status, 200)
    assert.deepEqual(await listed.json(), { courses: [course] })
    assert.equal((await fetch(`${baseUrl}/courses`)).status, 401)
    const otherList = await fetch(`${baseUrl}/courses`, { headers: userTwoHeaders })
    assert.equal(otherList.status, 200)
    assert.deepEqual(await otherList.json(), { courses: [] })

    const otherCreate = await create(userTwoHeaders, { name: '西语入门' })
    assert.equal(otherCreate.status, 201)
    const otherCourse = await otherCreate.json()
    assert.notEqual(otherCourse.id, course.id)
    assert.deepEqual(await (await fetch(`${baseUrl}/courses`, { headers: userTwoHeaders })).json(), { courses: [otherCourse] })
    assert.deepEqual(await (await fetch(`${baseUrl}/courses`, { headers: userOneHeaders })).json(), { courses: [course] })

    assert.equal((await create(userOneHeaders, { name: '西语入门' })).status, 409)
    assert.equal((await create(userOneHeaders, { name: ' ' })).status, 400)
    assert.equal((await create(userOneHeaders, { name: 'x'.repeat(41) })).status, 400)
    assert.equal((await create(userOneHeaders, { name: '新课', description: 'x'.repeat(501) })).status, 400)

    const invalidJson = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...userOneHeaders },
      body: '{'
    })
    assert.equal(invalidJson.status, 400)
    assert.deepEqual(await invalidJson.json(), { error: 'Invalid JSON' })
  })
})

test('temporary OpenID debug route is removed', async () => {
  await withServer(createApp(), async baseUrl => {
    const response = await fetch(`${baseUrl}/debug/openid`, { headers: userOneHeaders })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'Not Found' })
  })
})

test('course details and updates are scoped to the WeChat user', async () => {
  await withServer(createApp(), async baseUrl => {
    const request = (path, method, headers, body) => fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    const createdResponse = await request('/courses', 'POST', userOneHeaders, {
      name: '西语入门', description: '初级课程'
    })
    const created = await createdResponse.json()
    assert.equal(createdResponse.status, 201)

    const detailResponse = await request(`/courses/${created.id}`, 'GET', userOneHeaders)
    assert.equal(detailResponse.status, 200)
    assert.deepEqual(await detailResponse.json(), { course: created })
    assert.equal((await request(`/courses/${created.id}`, 'GET', userTwoHeaders)).status, 404)
    assert.equal((await request(`/courses/${created.id}`, 'PATCH', {}, { name: '新名称' })).status, 401)

    const updatedResponse = await request(`/courses/${created.id}`, 'PATCH', userOneHeaders, {
      name: ' 西语进阶 ', description: ' 适合有基础的学员 '
    })
    assert.equal(updatedResponse.status, 200)
    const updated = (await updatedResponse.json()).course
    assert.equal(updated.id, created.id)
    assert.equal(updated.name, '西语进阶')
    assert.equal(updated.description, '适合有基础的学员')
    assert.equal(updated.createdAt, created.createdAt)
    assert.equal('ownerOpenid' in updated, false)

    assert.equal((await request('/courses', 'POST', userOneHeaders, { name: '已占用' })).status, 201)
    assert.equal((await request(`/courses/${created.id}`, 'PATCH', userOneHeaders, { name: '已占用' })).status, 409)
    assert.equal((await request(`/courses/${created.id}`, 'PATCH', userOneHeaders, { name: ' ' })).status, 400)
    assert.equal((await request(`/courses/${created.id}`, 'PATCH', userOneHeaders, { name: 'x'.repeat(41) })).status, 400)
    assert.equal((await request(`/courses/${created.id}`, 'PATCH', userOneHeaders, { name: '新名称', description: 'x'.repeat(501) })).status, 400)
    assert.equal((await request('/courses/missing', 'PATCH', userOneHeaders, { name: '新名称' })).status, 404)
    assert.equal((await request(`/courses/${created.id}`, 'PATCH', userTwoHeaders, { name: '他人的课程' })).status, 404)

    const list = await request('/courses', 'GET', userOneHeaders)
    assert.deepEqual((await list.json()).courses.map(course => course.name).sort(), ['已占用', '西语进阶'])
  })
})
