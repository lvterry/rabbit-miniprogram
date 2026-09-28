const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const { createApp } = require('../src/app')

function loadClient(baseUrl) {
  const storage = new Map(), cache = new Map()
  const wx = {
    getStorageSync: key => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast() {}, navigateTo() {}, navigateBack() {},
    cloud: { init() {}, async callContainer(options) {
      const response = await fetch(`${baseUrl}${options.path}`, { method: options.method,
        headers: { 'content-type': 'application/json', 'x-wx-source': 'test', 'x-wx-openid': 'client-user' },
        ...(options.data ? { body: JSON.stringify(options.data) } : {}) })
      return { statusCode: response.status, data: await response.json() }
    } }
  }
  const app = {}
  function load(relative) {
    const filename = path.resolve(__dirname, '../..', relative)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    const context = { module, exports: module.exports, wx, console, setTimeout,
      getApp: () => app, App: definition => Object.assign(app, definition),
      Page: definition => { module.exports = { ...definition, data: structuredClone(definition.data),
        setData(update, callback) { Object.assign(this.data, update); if (callback) callback() } } },
      require: dependency => load(path.relative(path.resolve(__dirname, '../..'), path.resolve(path.dirname(filename), dependency + '.js'))) }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename })
    return module.exports
  }
  return { load, wx, app, storage }
}

async function withClient(run) {
  const server = await new Promise(resolve => { const listening = createApp().listen(0, '127.0.0.1', () => resolve(listening)) })
  try { await run(loadClient(`http://127.0.0.1:${server.address().port}`)) }
  finally { await new Promise(resolve => server.close(resolve)) }
}

test('client pages use one API for appointment, today, complete, student balance and revenue', async () => {
  await withClient(async ({ load, app }) => {
    load('app.js'); app.onLaunch()
    assert.equal('store' in app, false)
    const courses = load('utils/course-api.js'), students = load('utils/student-api.js')
    const course = await courses.createCourse({ name: '课程' })
    const student = await students.createStudent({ name: '真实学员', courseId: course.id })
    const detail = load('pages/student-detail/index.js'); detail.onLoad({ id: student.id }); await detail.refresh()
    detail.setData({ creditAmount: '2', fee: '88.50' }); await detail.confirmCredits()
    await detail.confirmAppointment()
    const today = load('pages/today/index.js'); await today.loadSessions()
    assert.equal(today.data.today.length, 1)
    const lesson = load('pages/class-detail/index.js'); lesson.onLoad({ id: today.data.today[0].id }); await lesson.refresh()
    assert.match(lesson.data.item.creditSummary, /剩余 2 次/)
    await lesson.apply('complete', {})
    assert.match(lesson.data.item.creditSummary, /剩余 1 次/)
    await detail.refresh()
    assert.equal(detail.data.student.remainingCredits, 1)
    assert.equal(detail.data.upcoming.length, 0)
    const report = load('pages/financial-reports/index.js'); await report.loadReport()
    assert.equal(report.data.totalText, '88.5')
    const me = load('pages/me/index.js'); await me.loadProfile()
    me.setData({ draftName: '老师姓名' }); await me.saveProfile()
    assert.equal(me.data.profile.name, '老师姓名')
    const feedback = load('pages/about/index.js'); feedback.setData({ feedbackText: '反馈已入库' }); await feedback.submitFeedback()
    assert.equal(feedback.data.error, '')
  })
})

test('client retries an uncertain credit response with the same identity across page reloads', async () => {
  await withClient(async ({ load, wx, storage }) => {
    const course = await load('utils/course-api.js').createCourse({ name: '课程' })
    const students = load('utils/student-api.js')
    const student = await students.createStudent({ name: '学员', courseId: course.id })
    const original = wx.cloud.callContainer
    let lost = true
    const keys = []
    wx.cloud.callContainer = async options => {
      if (options.path.endsWith('/credits')) {
        keys.push(options.data.requestId)
        const result = await original(options)
        if (lost) { lost = false; throw new Error('Response lost after commit') }
        return result
      }
      return original(options)
    }
    await assert.rejects(students.addStudentCredits(student.id, { amount: '3', fee: '99' }))
    assert.equal(Object.keys(storage.get('xiaotu-pending-requests-v1')).length, 1)
    await students.addStudentCredits(student.id, { amount: '3', fee: '99' })
    assert.equal(keys[0], keys[1])
    assert.equal((await students.getStudent(student.id)).remainingCredits, 3)
    assert.equal((await load('utils/account-api.js').getRevenueReport()).total, 99)
    assert.equal(Object.keys(storage.get('xiaotu-pending-requests-v1')).length, 0)
  })
})

test('client page errors stay retryable and never populate mock data', async () => {
  await withClient(async ({ load, wx }) => {
    wx.cloud.callContainer = async () => ({ statusCode: 503, data: { error: 'Unavailable' } })
    const today = load('pages/today/index.js'); await today.loadSessions()
    assert.equal(today.data.today.length, 0); assert.equal(today.data.loading, false); assert.ok(today.data.error)
    const student = load('pages/student-detail/index.js'); student.onLoad({ id: 'missing' }); await student.refresh()
    assert.equal(student.data.student, null); assert.equal(student.data.loading, false); assert.ok(student.data.loadError)
    const edit = load('pages/student-edit/index.js'); edit.studentId = 'missing'; await edit.refresh()
    assert.equal(edit.data.loaded, false); assert.ok(edit.data.error)
    const lesson = load('pages/class-detail/index.js'); lesson.onLoad({ id: 'missing' }); await lesson.refresh()
    assert.equal(lesson.data.item, null); assert.ok(lesson.data.loadError)
    const me = load('pages/me/index.js'); await me.loadProfile()
    assert.equal(me.data.profile, null); assert.ok(me.data.error)
    const report = load('pages/financial-reports/index.js'); await report.loadReport()
    assert.equal(report.data.months.length, 0); assert.ok(report.data.error)
    const about = load('pages/about/index.js'); about.setData({ feedbackText: '反馈' }); await about.submitFeedback()
    assert.equal(about.data.saving, false); assert.ok(about.data.error)
  })
})
