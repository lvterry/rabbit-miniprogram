const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const { createMysqlStore } = require('../src/mysql-store')
const fs = require('node:fs')
const path = require('node:path')
const { businessDate } = require('../src/domain')
const { businessContract } = require('./business-contract')

const socketPath = process.env.RABBIT_TEST_MYSQL_SOCKET
if (!socketPath) {
  test('MySQL integration (set RABBIT_TEST_MYSQL_SOCKET for an isolated database)', { skip: true }, () => {})
} else {
  let admin, pool, store, database
  test.before(async () => {
    database = `rabbit_test_${randomUUID().replaceAll('-', '')}`
    admin = await mysql.createConnection({ socketPath, user: process.env.RABBIT_TEST_MYSQL_USER || 'root', dateStrings: true, timezone: 'Z' })
    await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`)
    pool = mysql.createPool({ socketPath, user: process.env.RABBIT_TEST_MYSQL_USER || 'root', database, dateStrings: true, timezone: 'Z', connectionLimit: 5 })
    store = createMysqlStore(pool)
    await store.initialize()
  })
  test.after(async () => {
    if (store) await store.close()
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${database}`); await admin.end() }
  })
  businessContract(test, 'MySQL', async () => store)
  test('MySQL: existing cloud data migrates once without resetting balances or appointments', async () => {
    const legacyDatabase = `rabbit_test_${randomUUID().replaceAll('-', '')}`
    await admin.query(`CREATE DATABASE ${legacyDatabase} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`)
    const legacyPool = mysql.createPool({ socketPath, user: process.env.RABBIT_TEST_MYSQL_USER || 'root', database: legacyDatabase, dateStrings: true, timezone: 'Z' })
    try {
      const schema = fs.readFileSync(path.join(__dirname, '../src/schema.sql'), 'utf8')
      for (const statement of schema.split(';').slice(0, 4)) await legacyPool.query(statement)
      const owner = randomUUID(), courseId = randomUUID(), studentId = randomUUID(), appointmentId = randomUUID(), grantId = randomUUID()
      await legacyPool.query(`CREATE TABLE accounts (
        id CHAR(36) NOT NULL PRIMARY KEY, owner_openid VARCHAR(128) NOT NULL UNIQUE,
        name VARCHAR(40) NOT NULL DEFAULT '微信用户', created_at DATETIME(3) NOT NULL)`)
      const accountId = randomUUID()
      await legacyPool.execute("INSERT INTO accounts (id, owner_openid, name, created_at) VALUES (?, ?, '旧展示姓名', UTC_TIMESTAMP(3))", [accountId, owner])
      await legacyPool.execute(`INSERT INTO courses (id, owner_openid, name, description, status, created_at) VALUES (?, ?, '旧课程', '', 'active', UTC_TIMESTAMP(3))`, [courseId, owner])
      await legacyPool.execute(`INSERT INTO students (id, owner_openid, course_id, name, notes, total_credits, remaining_credits, created_at)
        VALUES (?, ?, ?, '旧学员', '保留备注', 10, 7, UTC_TIMESTAMP(3))`, [studentId, owner, courseId])
      await legacyPool.execute(`INSERT INTO student_credits (id, owner_openid, student_id, amount, fee, notes, created_at)
        VALUES (?, ?, ?, 10, 333.33, '旧充值', UTC_TIMESTAMP(3))`, [grantId, owner, studentId])
      await legacyPool.execute(`INSERT INTO student_appointments (id, owner_openid, student_id, appointment_date, start_time, end_time, notes, status, created_at)
        VALUES (?, ?, ?, ?, '15:00:00', '16:00:00', '旧预约', 'scheduled', UTC_TIMESTAMP(3))`, [appointmentId, owner, studentId, businessDate()])
      const legacyStore = createMysqlStore(legacyPool)
      await legacyStore.initialize()
      await legacyStore.initialize()
      assert.equal((await legacyStore.getProfile(owner)).id, accountId)
      assert.equal((await legacyStore.getProfile(owner)).loggedIn, false)
      await legacyStore.bindPhone(owner, { phoneNumber: '13400003931', countryCode: '86' })
      await legacyStore.initialize()
      assert.equal((await legacyStore.getProfile(owner)).phoneMasked, '134****3931')
      const [accountRows] = await legacyPool.execute('SELECT name FROM accounts WHERE id = ?', [accountId])
      assert.equal(accountRows[0].name, '旧展示姓名')
      const student = await legacyStore.getStudent(owner, studentId)
      assert.equal(student.remainingCredits, 7)
      assert.equal(student.totalCredits, 10)
      assert.equal(student.notes, '保留备注')
      assert.equal(student.appointments.length, 1)
      assert.equal(student.appointments[0].id, appointmentId)
      assert.equal((await legacyStore.getFinancialReport(owner)).total, 333.33)
      await legacyStore.changeSession(owner, appointmentId, { action: 'complete', version: 0 }, randomUUID())
      assert.equal((await legacyStore.getStudent(owner, studentId)).remainingCredits, 6)
      const [sum] = await legacyPool.execute('SELECT SUM(delta) AS balance FROM credit_ledger WHERE student_id = ?', [studentId])
      assert.equal(Number(sum[0].balance), 6)
      const restarted = createMysqlStore(legacyPool)
      assert.equal((await restarted.getSession(owner, appointmentId)).status, 'completed')
      const [oldRows] = await legacyPool.execute('SELECT COUNT(*) AS count FROM student_appointments WHERE id = ?', [appointmentId])
      assert.equal(oldRows[0].count, 1)
    } finally { await legacyPool.end(); await admin.query(`DROP DATABASE ${legacyDatabase}`) }
  })
  test('MySQL: ledger sum matches balances; restarting initialization preserves data', async () => {
    const [before] = await pool.query('SELECT COUNT(*) AS count FROM class_sessions')
    await store.initialize()
    const [after] = await pool.query('SELECT COUNT(*) AS count FROM class_sessions')
    assert.equal(before[0].count, after[0].count)
    const [rows] = await pool.query(`SELECT s.id, s.remaining_credits AS balance, IFNULL(SUM(l.delta), 0) AS ledgerBalance
      FROM students s LEFT JOIN credit_ledger l ON s.id = l.student_id AND s.owner_openid = l.owner_openid GROUP BY s.id, s.remaining_credits`)
    rows.forEach(row => assert.equal(Number(row.balance), Number(row.ledgerBalance)))
  })
}
