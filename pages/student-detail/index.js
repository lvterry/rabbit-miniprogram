const { todayKey } = require('../../utils/mock')
const { viewClass } = require('../../utils/format')

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
    minDate: todayKey()
  },

  onLoad(options) { this.studentId = options.id },
  onShow() { this.refresh() },

  refresh() {
    const app = getApp()
    const student = app.getStudent(this.studentId)
    if (!student) {
      wx.showToast({ title: '找不到这位学员', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    const upcoming = app.store.classes
      .filter(item => item.studentIds.includes(student.id) && item.status === 'scheduled' && item.date >= todayKey())
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .slice(0, 1)
      .map(viewClass)
    this.setData({
      student,
      upcoming,
      creditProgress: student.totalCredits ? Math.min(100, student.remainingCredits / student.totalCredits * 100) : 0,
      minDate: todayKey()
    })
  },

  openEdit() {
    wx.navigateTo({ url: `/pages/student-edit/index?id=${this.studentId}` })
  },

  openClass(event) {
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

  closeSheet() { this.setData({ sheet: '' }) },
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
    if (this.data.appointmentStart === this.data.appointmentEnd) {
      wx.showToast({ title: '结束时间不能与开始时间相同', icon: 'none' })
      return
    }
    const endDate = this.data.appointmentEndIsNextDay ? shiftDate(this.data.appointmentDate, 1) : ''
    const ok = getApp().changeStudent(this.studentId, 'addAppointment', {
      date: this.data.appointmentDate,
      start: this.data.appointmentStart,
      end: this.data.appointmentEnd,
      endDate,
      notes: this.data.appointmentNotes
    })
    if (!ok) {
      wx.showToast({ title: '预约未添加，请检查日期和时间', icon: 'none' })
      return
    }
    this.setData({ sheet: '' })
    this.refresh()
    wx.showToast({ title: '预约已添加', icon: 'success' })
  }
})
