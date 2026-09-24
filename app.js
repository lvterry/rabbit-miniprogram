const { createMockStore, todayKey } = require('./utils/mock')
const { timestamp } = require('./utils/format')
const { colors } = require('./utils/design-tokens')

const STORAGE_KEY = 'xiaotu-prototype-v2'

App({
  onLaunch() {
    const saved = wx.getStorageSync(STORAGE_KEY)
    const initial = createMockStore()
    this.store = saved && saved.seedDate === todayKey() ? { ...initial, ...saved } : initial
    if (!Array.isArray(this.store.offerings)) this.store.offerings = initial.offerings
    if (!Array.isArray(this.store.revenueRecords)) this.store.revenueRecords = initial.revenueRecords
    if (!Array.isArray(this.store.feedback)) this.store.feedback = []
    if (!this.store.profile) this.store.profile = initial.profile
    this.save()
  },

  save() {
    wx.setStorageSync(STORAGE_KEY, this.store)
  },

  resetMock() {
    this.store = createMockStore()
    this.save()
  },

  getClass(id) {
    return this.store.classes.find(item => item.id === id)
  },

  getStudent(id) {
    return this.store.students.find(item => item.id === id)
  },

  getOffering(id) {
    return this.store.offerings.find(item => item.id === id)
  },

  loginDemo() {
    this.store.profile.loggedIn = true
    this.save()
  },

  logoutDemo() {
    this.store.profile.loggedIn = false
    this.save()
  },

  saveOffering(id, payload) {
    const name = (payload.name || '').trim()
    const description = (payload.description || '').trim()
    if (!name) return false
    if (this.store.offerings.some(item => item.id !== id && item.name === name)) return false
    if (id) {
      const offering = this.getOffering(id)
      if (!offering) return false
      const previousName = offering.name
      offering.name = name
      offering.description = description
      if (previousName !== name) {
        this.store.students.forEach(student => {
          if (offering.studentIds.includes(student.id) && student.className === previousName) student.className = name
        })
        this.store.classes.forEach(item => {
          if (item.title === previousName) item.title = name
        })
      }
      this.save()
      return offering
    }
    const offering = { id: `offering-${Date.now()}`, name, description, studentIds: [] }
    this.store.offerings.push(offering)
    this.save()
    return offering
  },

  addFeedback(message) {
    const text = (message || '').trim()
    if (!text) return false
    this.store.feedback.unshift({ id: `feedback-${Date.now()}`, text, time: timestamp() })
    this.save()
    return true
  },

  addStudent(payload) {
    const name = (payload.name || '').trim()
    const className = (payload.className || '').trim()
    if (!name || !className) return false
    const id = `student-${Date.now()}`
    const student = {
      id,
      name,
      initial: name.slice(0, 1).toUpperCase(),
      color: colors.brandSoft,
      isActive: true,
      learningLabel: '新学员',
      className,
      startedLabel: '今天开始',
      notes: (payload.notes || '').trim(),
      remainingCredits: 0,
      totalCredits: 0,
      creditHistory: [],
      appointmentHistory: []
    }
    this.store.students.unshift(student)
    const offering = this.store.offerings.find(item => item.name === className)
    if (offering) offering.studentIds.push(id)
    this.save()
    return student
  },

  changeStudent(id, action, payload = {}) {
    const student = this.getStudent(id)
    if (!student) return false

    if (action === 'edit') {
      const name = (payload.name || '').trim()
      const className = (payload.className || '').trim()
      if (!name || !this.store.offerings.some(item => item.name === className)) return false
      const oldName = student.name
      const oldClassName = student.className
      student.name = name
      student.initial = name.slice(0, 1).toUpperCase()
      student.className = className
      student.notes = (payload.notes || '').trim()
      if (oldClassName !== className) {
        const previousOffering = this.store.offerings.find(item => item.name === oldClassName)
        const nextOffering = this.store.offerings.find(item => item.name === className)
        if (previousOffering) previousOffering.studentIds = previousOffering.studentIds.filter(studentId => studentId !== id)
        if (nextOffering && !nextOffering.studentIds.includes(id)) nextOffering.studentIds.push(id)
      }
      this.store.classes.forEach(item => {
        if (!item.studentIds.includes(id)) return
        if (item.studentIds.length === 1) item.title = className
        item.studentNames = item.studentIds.length === 1
          ? name
          : item.studentNames.replace(oldName, name)
      })
    } else if (action === 'addCredits') {
      const amount = Math.floor(Number(payload.amount))
      const fee = Number(payload.fee || 0)
      if (!Number.isFinite(amount) || amount < 1 || !Number.isFinite(fee) || fee < 0) return false
      student.remainingCredits += amount
      student.totalCredits += amount
      student.creditHistory.unshift({
        id: `credit-${Date.now()}`,
        time: timestamp(),
        title: `添加 ${amount} 次课时`,
        detail: fee ? `费用：¥${fee}` : '未填写费用',
        note: (payload.notes || '').trim()
      })
    } else if (action === 'addAppointment') {
      const { date, start, end } = payload
      if (!date || !start || !end || start === end) return false
      const id = `class-${Date.now()}`
      const note = (payload.notes || '').trim()
      this.store.classes.push({
        id,
        title: student.className,
        studentNames: student.name,
        studentIds: [student.id],
        date,
        endDate: payload.endDate || '',
        start,
        end,
        note,
        status: 'scheduled',
        creditConsumed: false,
        history: []
      })
      student.isActive = true
      student.appointmentHistory.unshift({
        id: `appointment-${Date.now()}`,
        time: timestamp(),
        title: '添加预约',
        detail: `${date} ${start}–${payload.endDate ? '次日 ' : ''}${end}`,
        note
      })
    } else {
      return false
    }

    this.save()
    return true
  },

  changeClass(id, action, payload = {}) {
    const item = this.getClass(id)
    if (!item) return false

    let title = ''
    if (action === 'reschedule' && item.status === 'scheduled') {
      const endDate = payload.endDate || payload.date
      const [year, month, day] = (payload.date || '').split('-').map(Number)
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number)
      const dayDifference = (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(year, month - 1, day)) / 86400000
      const toMinutes = value => {
        const [hours, minutes] = (value || '').split(':').map(Number)
        return hours * 60 + minutes
      }
      const duration = dayDifference * 1440 + toMinutes(payload.end) - toMinutes(payload.start)
      if (!payload.date || payload.date < todayKey() || !payload.start || !payload.end || dayDifference < 0 || dayDifference > 1 || duration <= 0 || duration > 1440) return false
      if (payload.date === item.date && payload.start === item.start && payload.end === item.end && endDate === (item.endDate || item.date)) return false
      item.date = payload.date
      item.start = payload.start
      item.end = payload.end
      item.endDate = endDate === payload.date ? '' : endDate
      title = `将课程改期至 ${payload.date} ${payload.start}–${endDate === payload.date ? '' : `${endDate} `}${payload.end}`
    } else if (action === 'cancel' && item.status === 'scheduled') {
      item.status = 'cancelled'
      item.creditConsumed = !!payload.consumeCredit
      title = item.creditConsumed ? '取消课程，消耗 1 课时' : '取消课程，不消耗课时'
    } else if (action === 'restore' && item.status === 'cancelled') {
      item.status = 'scheduled'
      item.creditConsumed = false
      title = '恢复课程'
    } else if (action === 'complete' && item.status === 'scheduled') {
      item.status = 'completed'
      item.creditConsumed = true
      title = '完成课程，消耗 1 课时'
    } else if (action === 'uncomplete' && item.status === 'completed') {
      item.status = 'scheduled'
      item.creditConsumed = false
      title = '撤销完成，返还 1 课时'
    } else if (action === 'editNote') {
      item.note = (payload.note || '').trim()
      title = '修改课程备注'
    } else {
      return false
    }

    item.history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: timestamp(),
      title,
      note: (payload.actionNote || '').trim()
    })
    this.save()
    return true
  }
})
