const { colors } = require('./design-tokens')

function pad(number) { return String(number).padStart(2, '0') }

function dateAfter(days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function todayKey() { return dateAfter(0) }

function recentMonths() {
  const today = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const month = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1)
    return `${month.getFullYear()}-${pad(month.getMonth() + 1)}`
  })
}

function createMockStore() {
  const students = [
    { id: 'jason', name: 'Jason', initial: 'J', color: colors.avatar[0], isActive: true, learningLabel: '学习 3 个月', className: '西语 1 对 1', startedLabel: '3 年前', notes: 'A bright one, eager to learn.', remainingCredits: 12, totalCredits: 20, creditHistory: [{ id: 'jason-credit-1', time: '2026.06.23 10:30', title: '购买 20 次课时', detail: '费用：¥2,000', note: '' }], appointmentHistory: [{ id: 'jason-appointment-1', time: '2026.09.20 12:00', title: '完成课程', detail: '西语 1 对 1 · 12:00–13:00', note: '复习了上一节课的内容。' }] },
    { id: 'elle', name: 'Elle Wang', initial: 'E', color: colors.avatar[1], isActive: true, learningLabel: '学习 2 年', className: '西语 1 对 1', startedLabel: '2 年前', notes: 'Enjoys conversational practice.', remainingCredits: 34, totalCredits: 40, creditHistory: [], appointmentHistory: [] },
    { id: 'julia', name: 'Julia', initial: 'J', color: colors.avatar[2], isActive: false, learningLabel: '学习 2 年', className: '西语 1 对 1', startedLabel: '2 年前', notes: 'Prefers weekend lessons.', remainingCredits: 60, totalCredits: 60, creditHistory: [], appointmentHistory: [] },
    { id: 'mike', name: 'Mike', initial: 'M', color: colors.avatar[3], isActive: false, learningLabel: '学习 2 周', className: '西语 1 对 1', startedLabel: '2 周前', notes: 'New student.', remainingCredits: 10, totalCredits: 10, creditHistory: [], appointmentHistory: [] },
    { id: 'chole', name: 'Chole', initial: 'C', color: colors.avatar[4], isActive: false, learningLabel: '学习 1 年', className: '西语 1 对 1', startedLabel: '1 年前', notes: 'A bright one, eager to learn.', remainingCredits: 21, totalCredits: 21, creditHistory: [], appointmentHistory: [] }
  ]

  return {
    seedDate: todayKey(),
    students,
    profile: { loggedIn: false, name: 'Ms. Jelly' },
    feedback: [],
    offerings: [
      { id: 'offering-spanish-one', name: '西语 1 对 1', description: '一对一西语课程，按学员进度安排学习内容。', studentIds: ['jason', 'elle', 'julia', 'mike', 'chole'] },
      { id: 'offering-spanish-group', name: '西语小组课', description: '通过小组练习提升日常西语交流能力。', studentIds: ['chole', 'julia'] }
    ],
    revenueRecords: recentMonths().flatMap((month, index) => [
      { id: `income-one-${month}`, offeringId: 'offering-spanish-one', date: `${month}-15`, amount: [1000, 1200, 1000, 1100, 1400, 1300][index] },
      { id: `income-group-${month}`, offeringId: 'offering-spanish-group', date: `${month}-18`, amount: [500, 300, 400, 600, 600, 600][index] }
    ]),
    classes: [
      { id: 'class-jason-today', title: '西语 1 对 1', studentNames: 'Jason', studentIds: ['jason'], date: dateAfter(0), start: '14:00', end: '15:00', note: '在学生家上课', status: 'scheduled', creditConsumed: false, history: [] },
      { id: 'class-elle-today', title: '西语 1 对 1', studentNames: 'Elle Wang', studentIds: ['elle'], date: dateAfter(0), start: '17:00', end: '19:00', note: '复习上次的口语练习', status: 'scheduled', creditConsumed: false, history: [] },
      { id: 'class-elle-next', title: '西语 1 对 1', studentNames: 'Elle Wang', studentIds: ['elle'], date: dateAfter(1), start: '17:00', end: '19:00', note: '', status: 'scheduled', creditConsumed: false, history: [] },
      { id: 'class-jason-next', title: '西语 1 对 1', studentNames: 'Jason', studentIds: ['jason'], date: dateAfter(2), start: '13:00', end: '14:00', note: '', status: 'scheduled', creditConsumed: false, history: [] },
      { id: 'class-group-next', title: '西语小组课', studentNames: 'Chole、Julia 等 5 人', studentIds: ['chole', 'julia'], date: dateAfter(3), start: '09:00', end: '12:00', note: '小组会话练习', status: 'scheduled', creditConsumed: false, history: [] }
    ]
  }
}

module.exports = { createMockStore, todayKey, dateAfter }
