const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { businessDate } = require('../src/domain')
const { createApp } = require('../src/app')

async function withApi(store, run) {
  const server = await new Promise(resolve => {
    const listening = createApp({ store, exchangePhoneCode: async code => {
      if (code !== 'phone-code') { const error = new Error('Invalid phone authorization'); error.code = 'PHONE_AUTH_INVALID'; throw error }
      return { phoneNumber: '13400003931', countryCode: '86' }
    } }).listen(0, '127.0.0.1', () => resolve(listening))
  })
  const owner = randomUUID(), other = randomUUID()
  async function request(path, method = 'GET', body, user = owner) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
      headers: { 'content-type': 'application/json', ...(user ? { 'x-wx-source': 'test', 'x-wx-openid': user } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }
  const create = async () => {
    const course = (await request('/courses', 'POST', { name: '真实课程' })).body
    const student = (await request('/students', 'POST', { name: '学员', courseId: course.id })).body
    return { course, student }
  }
  const credits = (id, amount = 2, fee = 0, requestId = randomUUID()) => request(`/students/${id}/credits`, 'POST', { amount, fee, requestId })
  const appointment = (id, fields = {}) => request(`/students/${id}/appointments`, 'POST', {
    date: businessDate(), start: '14:00', end: '16:00', requestId: randomUUID(), ...fields })
  const action = (id, action, version, fields = {}, user = owner) => request(`/sessions/${id}/actions`, 'POST', { action, version, requestId: randomUUID(), ...fields }, user)
  const balance = async id => (await request(`/students/${id}`)).body.student.remainingCredits
  try { await run({ request, create, credits, appointment, action, balance, owner, other }) }
  finally { await new Promise(resolve => server.close(resolve)) }
}

function businessContract(test, label, storeFactory) {
  test(`${label}: appointments, credits, consume, return and historical course identity`, async () => {
    await withApi(await storeFactory(), async ({ request, create, credits, appointment, action, balance }) => {
      const { course, student } = await create()
      assert.equal((await credits(student.id, 4, 120.35)).status, 201)
      const booked = await appointment(student.id)
      assert.equal(booked.status, 201)
      const session = booked.body.appointment
      assert.equal(session.title, course.name)
      assert.equal((await request('/sessions')).body.sessions.length, 1)
      assert.equal((await request(`/students/${student.id}`)).body.student.appointments[0].id, session.id)
      const nextCourse = (await request('/courses', 'POST', { name: '新课程' })).body
      await request(`/students/${student.id}`, 'PATCH', { name: '学员改名', courseId: nextCourse.id })
      assert.equal((await request(`/sessions/${session.id}`)).body.session.courseId, course.id)
      assert.equal((await request(`/sessions/${session.id}`)).body.session.studentNames, '学员改名')
      const completed = await action(session.id, 'complete', 0)
      assert.equal(completed.status, 200)
      assert.equal(completed.body.session.students[0].remainingCredits, 3)
      assert.equal(await balance(student.id), 3)
      assert.equal((await action(session.id, 'uncomplete', 1)).status, 200)
      assert.equal(await balance(student.id), 4)
      assert.equal((await action(session.id, 'cancel', 2, { consumeCredit: true })).status, 200)
      assert.equal(await balance(student.id), 3)
      assert.equal((await action(session.id, 'restore', 3)).status, 200)
      assert.equal(await balance(student.id), 4)
      assert.equal((await action(session.id, 'cancel', 4, { consumeCredit: false })).status, 200)
      assert.equal(await balance(student.id), 4)
      assert.equal((await action(session.id, 'restore', 5)).status, 200)
      assert.equal((await action(session.id, 'editNote', 6, { note: '云端备注' })).status, 200)
      const detail = (await request(`/sessions/${session.id}`)).body.session
      assert.equal(detail.note, '云端备注')
      assert.equal(detail.history.length, 8)
      assert.equal((await action(session.id, 'complete', 0)).status, 409)
      const report = (await request('/reports/revenue')).body.report
      assert.equal(report.total, 120.35)
      assert.equal(report.classBreakdown[0].id, course.id)
      assert.equal(report.months.length, 6)
    })
  })

  test(`${label}: duplicates and concurrent state changes cannot charge twice`, async () => {
    await withApi(await storeFactory(), async ({ request, create, credits, appointment, action, balance }) => {
      const { student } = await create()
      const creditKey = randomUUID()
      const responses = await Promise.all([credits(student.id, 3, 75.55, creditKey), credits(student.id, 3, 75.55, creditKey)])
      assert.deepEqual(responses.map(r => r.status), [201, 201])
      assert.equal(responses[0].body.record.id, responses[1].body.record.id)
      assert.equal(await balance(student.id), 3)
      assert.equal((await credits(student.id, 4, 75.55, creditKey)).status, 409)
      assert.equal((await request('/reports/revenue')).body.report.total, 75.55)
      const appointmentKey = randomUUID()
      const first = await appointment(student.id, { requestId: appointmentKey })
      const retry = await appointment(student.id, { requestId: appointmentKey })
      assert.equal(first.body.appointment.id, retry.body.appointment.id)
      const id = first.body.appointment.id
      const actionKey = randomUUID()
      const pair = await Promise.all([action(id, 'complete', 0, { requestId: actionKey }), action(id, 'complete', 0, { requestId: actionKey })])
      assert.deepEqual(pair.map(r => r.status), [200, 200])
      assert.equal(await balance(student.id), 2)
      assert.equal((await action(id, 'uncomplete', 1)).status, 200)
      const competing = await Promise.all([action(id, 'complete', 2), action(id, 'complete', 2)])
      assert.deepEqual(competing.map(r => r.status).sort(), [200, 409])
      assert.equal(await balance(student.id), 2)
    })
  })

  test(`${label}: concurrent different sessions cannot spend the same last credit`, async () => {
    await withApi(await storeFactory(), async ({ create, credits, appointment, action, balance }) => {
      const { student } = await create()
      await credits(student.id, 1)
      const first = (await appointment(student.id)).body.appointment
      const second = (await appointment(student.id, { start: '17:00', end: '18:00' })).body.appointment
      const results = await Promise.all([action(first.id, 'complete', 0), action(second.id, 'complete', 0)])
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
      assert.equal(results.find(result => result.status === 409).body.code, 'INSUFFICIENT_CREDITS')
      assert.equal(await balance(student.id), 0)
    })
  })

  test(`${label}: insufficient group credits roll back all participants and history`, async () => {
    await withApi(await storeFactory(), async ({ request, create, credits, action, balance }) => {
      const { course, student } = await create()
      const second = (await request('/students', 'POST', { name: '学员二', courseId: course.id })).body
      const ordered = [student, second].sort((a, b) => a.id.localeCompare(b.id))
      await credits(ordered[0].id, 1)
      const result = await request('/sessions', 'POST', { courseId: course.id, studentIds: ordered.map(s => s.id),
        date: businessDate(), start: '09:00', end: '10:00', requestId: randomUUID() })
      assert.equal(result.status, 201)
      const id = result.body.session.id
      const blocked = await action(id, 'complete', 0)
      assert.equal(blocked.status, 409)
      assert.equal(blocked.body.code, 'INSUFFICIENT_CREDITS')
      assert.equal(await balance(ordered[0].id), 1)
      assert.equal(await balance(ordered[1].id), 0)
      const unchanged = (await request(`/sessions/${id}`)).body.session
      assert.equal(unchanged.status, 'scheduled')
      assert.equal(unchanged.history.length, 1)
      assert.equal((await action(id, 'cancel', 0, { consumeCredit: true })).body.code, 'INSUFFICIENT_CREDITS')
      await credits(ordered[1].id, 1)
      assert.equal((await action(id, 'complete', 0)).status, 200)
      assert.equal(await balance(ordered[0].id), 0)
      assert.equal(await balance(ordered[1].id), 0)
      assert.equal((await action(id, 'uncomplete', 1)).status, 200)
      assert.equal(await balance(ordered[0].id), 1)
      assert.equal(await balance(ordered[1].id), 1)
    })
  })

  test(`${label}: invalid dates, money and course associations are rejected`, async () => {
    await withApi(await storeFactory(), async ({ request, create, appointment, action, credits }) => {
      const { student } = await create()
      for (const fields of [{ date: '2027-02-30' }, { date: '2020-01-01' }, { start: '25:00' }, { start: '14:00', end: '14:00' }, { endDate: '2028-01-01' }]) {
        assert.equal((await appointment(student.id, fields)).status, 400)
      }
      assert.equal((await credits(student.id, 1.5)).status, 400)
      assert.equal((await credits(student.id, 1, 1.234)).status, 400)
      assert.equal((await credits(student.id, 1, 100000000)).status, 400)
      const unlinked = (await request('/students', 'POST', { name: '未选课' })).body
      assert.equal((await appointment(unlinked.id)).body.code, 'COURSE_REQUIRED')
      const date = businessDate()
      const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1)
      const overnight = await appointment(student.id, { start: '23:00', end: '01:00', endDate: next.toISOString().slice(0, 10) })
      assert.equal(overnight.status, 201)
      assert.equal((await action(overnight.body.appointment.id, 'reschedule', 0, { date, start: '15:00', end: '17:00' })).status, 200)
      assert.equal((await request('/sessions?from=2027-02-30')).status, 400)
    })
  })

  test(`${label}: account, feedback, revenue and sessions isolate identities`, async () => {
    await withApi(await storeFactory(), async ({ request, create, appointment, action, credits, other }) => {
      const { course, student } = await create()
      await credits(student.id, 2, 99)
      const id = (await appointment(student.id)).body.appointment.id
      assert.equal((await request(`/sessions/${id}`, 'GET', undefined, other)).status, 404)
      assert.equal((await action(id, 'complete', 0, {}, other)).status, 404)
      assert.equal((await request('/sessions', 'GET', undefined, other)).body.sessions.length, 0)
      assert.equal((await request('/reports/revenue', 'GET', undefined, other)).body.report.total, 0)
      assert.equal((await request(`/students/${student.id}/credits`, 'POST', { amount: 2 }, other)).status, 404)
      assert.equal((await request('/sessions', 'POST', { courseId: course.id, studentIds: [student.id], date: businessDate(), start: '09:00', end: '10:00', requestId: randomUUID() }, other)).status, 404)
      const profile = (await request('/me')).body.profile
      assert.equal('ownerOpenid' in profile, false)
      assert.equal(profile.loggedIn, false)
      assert.equal(profile.phoneMasked, '')
      assert.equal((await request('/me/phone', 'POST', { phoneNumber: '13400003931' })).status, 400)
      assert.equal((await request('/me/phone', 'POST', { code: 'invalid' })).status, 400)
      assert.equal((await request('/me/phone', 'POST', { code: 'phone-code' }, '')).status, 401)
      const bound = (await request('/me/phone', 'POST', { code: 'phone-code' })).body.profile
      assert.equal(bound.id, profile.id)
      assert.equal(bound.loggedIn, true)
      assert.equal(bound.phoneMasked, '134****3931')
      assert.equal(JSON.stringify(bound).includes('13400003931'), false)
      assert.deepEqual((await request('/me')).body.profile, bound)
      assert.equal((await request('/me', 'GET', undefined, other)).body.profile.loggedIn, false)
      assert.notEqual((await request('/me', 'GET', undefined, other)).body.profile.id, profile.id)
      const fields = { message: '真实反馈', requestId: randomUUID() }
      const feedback = await request('/feedback', 'POST', fields)
      assert.equal(feedback.status, 201)
      assert.equal((await request('/feedback', 'POST', fields)).body.feedback.id, feedback.body.feedback.id)
      assert.equal((await request('/feedback', 'POST', { message: ' ' , requestId: randomUUID() })).status, 400)
      for (const path of ['/me', '/reports/revenue', '/sessions']) assert.equal((await request(path, 'GET', undefined, '')).status, 401)
    })
  })
}

module.exports = { businessContract, withApi }
