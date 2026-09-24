const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')

const userOne = { 'x-wx-source': 'test', 'x-wx-openid': 'user-one' }
const userTwo = { 'x-wx-source': 'test', 'x-wx-openid': 'user-two' }

async function withServer(run) {
  const app = createApp()
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

function post(baseUrl, path, headers, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

test('linked and unlinked students are grouped by course association and isolated by WeChat user', async () => {
  await withServer(async baseUrl => {
    const empty = await fetch(`${baseUrl}/students`, { headers: userOne })
    assert.equal(empty.status, 200)
    assert.deepEqual(await empty.json(), { students: [] })

    const courseOne = await (await post(baseUrl, '/courses', userOne, { name: '西语入门' })).json()
    const courseTwo = await (await post(baseUrl, '/courses', userTwo, { name: '西语入门' })).json()

    assert.equal((await post(baseUrl, '/students', {}, { name: '小王', courseId: courseOne.id })).status, 401)
    assert.equal((await fetch(`${baseUrl}/students`)).status, 401)

    const created = await post(baseUrl, '/students', userOne, {
      name: ' 小王 ', courseId: courseOne.id, notes: ' 初学 ', ownerOpenid: 'user-two'
    })
    assert.equal(created.status, 201)
    const student = await created.json()
    assert.match(student.id, /^[0-9a-f-]{36}$/)
    assert.equal(student.name, '小王')
    assert.equal(student.courseId, courseOne.id)
    assert.equal(student.courseName, courseOne.name)
    assert.equal(student.notes, '初学')
    assert.equal(student.isActive, true)
    assert.equal(typeof student.createdAt, 'string')
    assert.equal('ownerOpenid' in student, false)

    assert.deepEqual(await (await fetch(`${baseUrl}/students`, { headers: userOne })).json(), { students: [student] })
    assert.deepEqual(await (await fetch(`${baseUrl}/students`, { headers: userTwo })).json(), { students: [] })

    const unlinked = await post(baseUrl, '/students', userOne, { name: '小张' })
    assert.equal(unlinked.status, 201)
    const unlinkedStudent = await unlinked.json()
    assert.equal(unlinkedStudent.courseId, '')
    assert.equal(unlinkedStudent.courseName, '')
    assert.equal(unlinkedStudent.isActive, false)
    assert.deepEqual(await (await fetch(`${baseUrl}/students`, { headers: userOne })).json(), { students: [unlinkedStudent, student] })

    const otherStudent = await post(baseUrl, '/students', userTwo, { name: '小李', courseId: courseTwo.id })
    assert.equal(otherStudent.status, 201)
    assert.deepEqual(await (await fetch(`${baseUrl}/students`, { headers: userTwo })).json(), { students: [await otherStudent.json()] })
    assert.deepEqual(await (await fetch(`${baseUrl}/students`, { headers: userOne })).json(), { students: [unlinkedStudent, student] })
  })
})

test('student creation requires valid fields and a course owned by the caller', async () => {
  await withServer(async baseUrl => {
    const course = await (await post(baseUrl, '/courses', userOne, { name: '西语入门' })).json()
    for (const body of [
      { name: '', courseId: course.id },
      { name: 'x'.repeat(41), courseId: course.id },
      { name: '小王', courseId: 1 },
      { name: '小王', courseId: course.id, notes: 'x'.repeat(201) },
      { name: '小王', courseId: course.id, notes: 5 }
    ]) {
      assert.equal((await post(baseUrl, '/students', userOne, body)).status, 400)
    }
    assert.equal((await post(baseUrl, '/students', userOne, { name: '小王', courseId: 'missing' })).status, 404)
    assert.equal((await post(baseUrl, '/students', userTwo, { name: '小王', courseId: course.id })).status, 404)
    assert.deepEqual(await (await fetch(`${baseUrl}/students`, { headers: userOne })).json(), { students: [] })
  })
})
