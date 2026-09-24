const { todayKey } = require('../../utils/mock')
const { viewClass } = require('../../utils/format')

function timeMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function dateOffset(date, days) {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(year, month - 1, day + days, 12)
  const pad = number => String(number).padStart(2, '0')
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`
}

function durationMinutes(item) {
  const [year, month, day] = item.date.split('-').map(Number)
  const endDate = item.endDate || item.date
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number)
  const dayDifference = (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(year, month - 1, day)) / 86400000
  return dayDifference * 1440 + timeMinutes(item.end) - timeMinutes(item.start)
}

function endAfterDuration(date, start, duration) {
  const endMinutes = timeMinutes(start) + duration
  const dayDifference = Math.floor(endMinutes / 1440)
  const minutesInDay = endMinutes % 1440
  const pad = number => String(number).padStart(2, '0')
  return {
    end: `${pad(Math.floor(minutesInDay / 60))}:${pad(minutesInDay % 60)}`,
    endDate: dateOffset(date, dayDifference)
  }
}

Page({
  data: {
    item: null,
    sheet: '',
    sheetTitle: '',
    draftDate: '',
    draftStart: '',
    draftEnd: '',
    draftEndDate: '',
    draftDuration: 0,
    draftNote: '',
    reversalDescription: '',
    minDate: todayKey()
  },

  onLoad(options) { this.classId = options.id },
  onShow() { this.refresh() },

  refresh() {
    const item = getApp().getClass(this.classId)
    if (!item) {
      wx.showToast({ title: '找不到这节课', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    this.setData({ item: viewClass(item), minDate: todayKey() })
  },

  openSheet(event) {
    const sheet = event.currentTarget.dataset.sheet
    const item = this.data.item
    const titles = { reschedule: '课程改期', cancel: '取消课程', complete: '标记完成', restore: '恢复课程', uncomplete: '撤销完成', editNote: '编辑备注' }
    this.setData({
      sheet,
      sheetTitle: titles[sheet] || '',
      draftDate: item.date,
      draftStart: item.start,
      draftEnd: item.end,
      draftEndDate: item.endDate || item.date,
      draftDuration: durationMinutes(item),
      draftNote: sheet === 'editNote' ? item.note : '',
      reversalDescription: item.creditConsumed
        ? '课程会回到待上课状态，已消耗的课时将返还。'
        : '课程会回到待上课状态。'
    })
  },

  openStudent() {
    const studentIds = this.data.item && this.data.item.studentIds
    if (!studentIds || studentIds.length === 0) return
    wx.navigateTo({ url: `/pages/student-detail/index?id=${studentIds[0]}` })
  },

  closeSheet() { this.setData({ sheet: '' }) },
  onDateChange(event) {
    const date = event.detail.value
    const end = endAfterDuration(date, this.data.draftStart, this.data.draftDuration)
    this.setData({ draftDate: date, draftEnd: end.end, draftEndDate: end.endDate })
  },
  onStartChange(event) {
    const start = event.detail.value
    const end = endAfterDuration(this.data.draftDate, start, this.data.draftDuration)
    this.setData({ draftStart: start, draftEnd: end.end, draftEndDate: end.endDate })
  },
  onEndChange(event) { this.setData({ draftEnd: event.detail.value, draftEndDate: this.data.draftDate }) },
  onNoteInput(event) { this.setData({ draftNote: event.detail.value }) },

  apply(action, payload) {
    const changed = getApp().changeClass(this.classId, action, payload)
    if (!changed) {
      wx.showToast({ title: '操作未完成，请检查填写内容', icon: 'none' })
      return
    }
    this.setData({ sheet: '' })
    this.refresh()
    wx.showToast({ title: '已更新课程', icon: 'success' })
  },

  confirmReschedule() {
    this.apply('reschedule', {
      date: this.data.draftDate,
      start: this.data.draftStart,
      end: this.data.draftEnd,
      endDate: this.data.draftEndDate,
      actionNote: this.data.draftNote
    })
  },

  confirmCancel(event) {
    this.apply('cancel', {
      consumeCredit: event.currentTarget.dataset.consume === 'yes',
      actionNote: this.data.draftNote
    })
  },

  confirmComplete() {
    this.apply('complete', { actionNote: this.data.draftNote })
  },

  confirmRestore() {
    this.apply('restore', { actionNote: this.data.draftNote })
  },

  confirmUncomplete() {
    this.apply('uncomplete', { actionNote: this.data.draftNote })
  },

  confirmEditNote() {
    this.apply('editNote', { note: this.data.draftNote })
  }
})
