const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')
const { avatarSvg, studentAvatar } = require('../../utils/student-avatar')

test('avatar is saved on creation and remains stable across rename, list and detail', async () => {
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = { 'content-type': 'application/json', 'x-wx-source': 'test', 'x-wx-openid': 'avatar-user' }
  try {
    const student = await (await fetch(`${base}/students`, { method: 'POST', headers, body: JSON.stringify({ name: 'Elle' }) })).json()
    assert.deepEqual(student.avatar, { style: 'geometric', version: 1, seed: student.id })
    const renamed = await (await fetch(`${base}/students/${student.id}`, { method: 'PATCH', headers, body: JSON.stringify({ name: '新名字', courseId: '', notes: '' }) })).json()
    assert.deepEqual(renamed.student.avatar, student.avatar)
    const listed = await (await fetch(`${base}/students`, { headers })).json()
    const detail = await (await fetch(`${base}/students/${student.id}`, { headers })).json()
    assert.deepEqual(listed.students[0].avatar, student.avatar)
    assert.deepEqual(detail.student.avatar, student.avatar)
    assert.equal(studentAvatar(detail.student), studentAvatar(student))
    assert.equal(studentAvatar({ id: student.id, name: '旧学员' }), studentAvatar(student))
    const other = await (await fetch(`${base}/students`, { method: 'POST', headers, body: JSON.stringify({ name: 'Elle' }) })).json()
    assert.notEqual(other.avatar.seed, student.avatar.seed)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('SVG generator is deterministic with only the six chosen transparent shapes', () => {
  const outputs = new Set()
  for (let seed = 0; seed < 100; seed++) {
    const avatar = { seed: String(seed) }
    const svg = avatarSvg(avatar)
    assert.equal(svg, avatarSvg(avatar))
    assert.match(svg, /62%,62%/)
    assert.doesNotMatch(svg, /<image|<text|width="100"|M27 75|M37 23/)
    outputs.add(svg)
  }
  assert.ok(outputs.size > 50)
})
