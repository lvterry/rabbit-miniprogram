const { randomUUID, createHash } = require('node:crypto')

function domainError(code, message) {
  return Object.assign(new Error(message), { code })
}

function businessDate() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

function validRange(fields, { future = true } = {}) {
  const { date, start, end, endDate = '' } = fields
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  const validDate = value => {
    if (typeof value !== 'string' || !datePattern.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!validDate(date) || !validDate(endDate || date) ||
      typeof start !== 'string' || !timePattern.test(start) ||
      typeof end !== 'string' || !timePattern.test(end) ||
      typeof endDate !== 'string' || (future && date < businessDate())) return false
  const dayDifference = (new Date(`${endDate || date}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
  const duration = dayDifference * 1440 + minutes(end) - minutes(start)
  return dayDifference >= 0 && dayDifference <= 1 && duration > 0 && duration <= 1440
}

function fingerprint(scope, fields) {
  return createHash('sha256').update(JSON.stringify([scope, fields])).digest('hex')
}

function operationKey(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value)
}

function monthRange() {
  const today = businessDate()
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1))
    return date.toISOString().slice(0, 7)
  })
}

function financialReport(payments) {
  const months = monthRange()
  const startDate = `${months[0]}-01`
  const endDate = businessDate()
  const relevant = payments.filter(payment => payment.date >= startDate && payment.date <= endDate)
  const courseTotals = new Map()
  const monthly = new Map(months.map(month => [month, 0]))
  let totalCents = 0
  relevant.forEach(payment => {
    const cents = Math.round(Number(payment.amount) * 100)
    totalCents += cents
    monthly.set(payment.date.slice(0, 7), monthly.get(payment.date.slice(0, 7)) + cents)
    const id = payment.courseId || 'unassigned'
    const current = courseTotals.get(id) || { id, name: payment.courseName || '未关联课程', cents: 0 }
    current.cents += cents
    courseTotals.set(id, current)
  })
  return {
    startDate, endDate, total: totalCents / 100,
    classBreakdown: [...courseTotals.values()].map(({ cents, ...course }) => ({ ...course, amount: cents / 100 })),
    months: [...monthly].map(([key, cents]) => ({ key, amount: cents / 100 }))
  }
}

function sessionView(session, bookings, history = []) {
  const students = bookings.map(booking => ({
    id: booking.studentId, name: booking.name, remainingCredits: Number(booking.remainingCredits),
    creditConsumed: !!booking.creditConsumed
  }))
  return { ...session, studentIds: students.map(student => student.id),
    studentNames: students.map(student => student.name).join('、'), students,
    creditConsumed: students.some(student => student.creditConsumed), history }
}

function sessionTransition(session, fields) {
  if (session.version !== fields.version) throw domainError('SESSION_CONFLICT', 'Session has changed; refresh before retrying')
  const { action, consumeCredit = false } = fields
  const next = { ...session }
  let consumed = session.creditConsumed
  let title
  if (action === 'reschedule' && session.status === 'scheduled') {
    if (!validRange(fields)) throw domainError('INVALID_RANGE', 'Invalid appointment time range')
    Object.assign(next, { date: fields.date, start: fields.start, end: fields.end, endDate: fields.endDate || '' })
    title = `将课程改期至 ${next.date} ${next.start}–${next.endDate ? `${next.endDate} ` : ''}${next.end}`
  } else if (action === 'cancel' && session.status === 'scheduled') {
    next.status = 'cancelled'; consumed = consumeCredit
    title = consumed ? '取消课程，每位学员消耗 1 课时' : '取消课程，不消耗课时'
  } else if (action === 'complete' && session.status === 'scheduled') {
    next.status = 'completed'; consumed = true; title = '完成课程，每位学员消耗 1 课时'
  } else if (action === 'restore' && session.status === 'cancelled') {
    next.status = 'scheduled'; consumed = false; title = '恢复课程，返还已消耗的课时'
  } else if (action === 'uncomplete' && session.status === 'completed') {
    next.status = 'scheduled'; consumed = false; title = '撤销完成，返还已消耗的课时'
  } else if (action === 'editNote') {
    next.note = fields.note; title = '修改课程备注'
  } else throw domainError('SESSION_CONFLICT', 'Action is not available for the current status')
  next.version += 1
  return { next, consumed, title }
}

module.exports = { domainError, businessDate, validRange, fingerprint, operationKey, financialReport, sessionView, sessionTransition, randomUUID }
