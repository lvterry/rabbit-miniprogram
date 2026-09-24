const { todayKey } = require('../../utils/mock')
const { viewClass, relativeDate } = require('../../utils/format')
const { getStudent, addStudentCredits, addStudentAppointment } = require('../../utils/student-api')

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatCloudStudent(student) {
  const courseName = student.courseName || ''
  const appointments = (student.appointments || [])
    .filter(item => item.status === 'scheduled' && item.date >= todayKey())
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    .slice(0, 1)
    .map(item => ({
      ...item,
      title: courseName || '未关联课程',
      dateLabel: relativeDate(item.date),
      timeLabel: `${item.start}–${item.endDate ? `次日 ${item.end}` : item.end}`
    }))
  return {
    ...student,
    className: courseName || '未关联课程',
    startedLabel: `创建于 ${displayTime(student.createdAt).split(' ')[0]}`,
    creditHistory: (student.creditHistory || []).map(item => ({ ...item, time: displayTime(item.time) })),
    appointmentHistory: (student.appointmentHistory || []).map(item => ({ ...item, time: displayTime(item.time) })),
    appointments,
    upcoming: appointments
  }
}

function shiftDate(date, days) {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(year, month - 1, day + days, 12)
  const pad = value => String(value).padStart(2, '0')
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`
}

function isEndNextDay(start, end) {
  const minutes = value => {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }
  return minutes(end) < minutes(start)
}

Page({
  data: {
    student: null,
    source: '',
    loading: false,
    loadError: '',
    upcoming: [],
    creditProgress: 0,
    sheet: '',
    sheetTitle: '',
    historyItems: [],
    creditAmount: '',
    fee: '',
    creditNotes: '',
    appointmentDate: todayKey(),
    appointmentStart: '12:00',
    appointmentEnd: '13:00',
    appointmentEndIsNextDay: false,
    appointmentNotes: '',
    minDate: todayKey(),
    savingAction: false
  },

  onLoad(options) { this.studentId = options.id },
  onShow() { this.refresh() },

  refresh() {
    const app = getApp()
    const localStudent = app.getStudent(this.studentId)
    if (localStudent) {
      const upcoming = app.store.classes
        .filter(item => item.studentIds.includes(localStudent.id) && item.status === 'scheduled' && item.date >= todayKey())
        .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
        .slice(0, 1)
        .map(viewClass)
      this.setData({
        source: 'local', student: localStudent, upcoming,
        creditProgress: localStudent.totalCredits ? Math.min(100, localStudent.remainingCredits / localStudent.totalCredits * 100) : 0,
        minDate: todayKey(), loading: false, loadError: ''
      })
      return Promise.resolve(localStudent)
    }
    const requestId = (this.studentRequestId || 0) + 1
    this.studentRequestId = requestId
    this.setData({ source: 'cloud', loading: true, loadError: '' })
    return getStudent(this.studentId)
      .then(student => {
        if (requestId !== this.studentRequestId) return
        const formatted = formatCloudStudent(student)
        this.setData({
          student: formatted, upcoming: formatted.appointments,
          creditProgress: student.totalCredits ? Math.min(100, student.remainingCredits / student.totalCredits * 100) : 0,
          loading: false, minDate: todayKey()
        })
      })
      .catch(error => {
        if (requestId !== this.studentRequestId) return
        if (error.statusCode === 404) {
          wx.showToast({ title: '找不到这位学员', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1000)
        } else {
          this.setData({ student: null, loading: false, loadError: '云端学员加载失败，请重试' })
        }
      })
  },

  openEdit() {
    wx.navigateTo({ url: `/pages/student-edit/index?id=${this.studentId}` })
  },

  openClass(event) {
    if (this.data.source !== 'local') return
    wx.navigateTo({ url: `/pages/class-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  openSheet(event) {
    const sheet = event.currentTarget.dataset.sheet
    const student = this.data.student
    const titles = { credits: '添加课时', appointment: '添加预约', creditHistory: '课时记录', appointmentHistory: '预约记录' }
    const historyItems = sheet === 'creditHistory'
      ? (student.creditHistory || [])
      : sheet === 'appointmentHistory'
        ? (student.appointmentHistory || [])
        : []
    this.setData({
      sheet,
      sheetTitle: titles[sheet] || '',
      historyItems,
      creditAmount: '',
      fee: '',
      creditNotes: '',
      appointmentDate: todayKey(),
      appointmentStart: '12:00',
      appointmentEnd: '13:00',
      appointmentEndIsNextDay: false,
      appointmentNotes: ''
    })
  },

  closeSheet() {
    if (this.data.savingAction) return
    this.setData({ sheet: '' })
  },
  onCreditAmount(event) { this.setData({ creditAmount: event.detail.value }) },
  onFee(event) { this.setData({ fee: event.detail.value }) },
  onCreditNotes(event) { this.setData({ creditNotes: event.detail.value }) },
  onAppointmentNotes(event) { this.setData({ appointmentNotes: event.detail.value }) },
  onAppointmentDate(event) { this.setData({ appointmentDate: event.detail.value }) },
  onAppointmentStart(event) {
    this.setData({
      appointmentStart: event.detail.value,
      appointmentEndIsNextDay: isEndNextDay(event.detail.value, this.data.appointmentEnd)
    })
  },
  onAppointmentEnd(event) {
    this.setData({
      appointmentEnd: event.detail.value,
      appointmentEndIsNextDay: isEndNextDay(this.data.appointmentStart, event.detail.value)
    })
  },

  confirmCredits() {
    if (this.data.savingAction) return
    if (this.data.source === 'cloud') {
      this.setData({ savingAction: true })
      return addStudentCredits(this.studentId, {
        amount: this.data.creditAmount,
        fee: this.data.fee,
        notes: this.data.creditNotes
      })
        .then(() => {
          this.setData({ sheet: '', savingAction: false })
          wx.showToast({ title: '课时已添加', icon: 'success' })
          return this.refresh()
        })
        .catch(error => {
          this.setData({ savingAction: false })
          wx.showToast({ title: error.statusCode === 404 ? '找不到这位学员' : '课时添加失败，请检查数量和费用', icon: 'none' })
        })
    }
    const ok = getApp().changeStudent(this.studentId, 'addCredits', {
      amount: this.data.creditAmount,
      fee: this.data.fee,
      notes: this.data.creditNotes
    })
    if (!ok) {
      wx.showToast({ title: '请输入有效的课时数量和费用', icon: 'none' })
      return
    }
    this.setData({ sheet: '' })
    this.refresh()
    wx.showToast({ title: '课时已添加', icon: 'success' })
  },

  confirmAppointment() {
    if (this.data.savingAction) return
    if (this.data.appointmentStart === this.data.appointmentEnd) {
      wx.showToast({ title: '结束时间不能与开始时间相同', icon: 'none' })
      return
    }
    const endDate = this.data.appointmentEndIsNextDay ? shiftDate(this.data.appointmentDate, 1) : ''
    const payload = {
      date: this.data.appointmentDate,
      start: this.data.appointmentStart,
      end: this.data.appointmentEnd,
      endDate,
      notes: this.data.appointmentNotes
    }
    if (this.data.source === 'cloud') {
      this.setData({ savingAction: true })
      return addStudentAppointment(this.studentId, payload)
        .then(() => {
          this.setData({ sheet: '', savingAction: false })
          wx.showToast({ title: '预约已添加', icon: 'success' })
          return this.refresh()
        })
        .catch(error => {
          this.setData({ savingAction: false })
          const title = error.statusCode === 404 ? '找不到这位学员' : '预约未添加，请检查日期和时间'
          wx.showToast({ title, icon: 'none' })
        })
    }
    const ok = getApp().changeStudent(this.studentId, 'addAppointment', payload)
    if (!ok) {
      wx.showToast({ title: '预约未添加，请检查日期和时间', icon: 'none' })
      return
    }
    this.setData({ sheet: '' })
    this.refresh()
    wx.showToast({ title: '预约已添加', icon: 'success' })
  }
})
