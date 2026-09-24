Page({
  data: { studentId: '', name: '', className: '', classIndex: 0, offeringNames: [], notes: '' },

  onLoad(options) {
    this.studentId = options.id
    this.refresh()
  },

  refresh() {
    const app = getApp()
    const student = app.getStudent(this.studentId)
    if (!student) return
    const offeringNames = app.store.offerings.map(item => item.name)
    const currentIndex = offeringNames.indexOf(student.className)
    const classIndex = currentIndex >= 0 ? currentIndex : 0
    this.setData({
      name: student.name,
      className: offeringNames[classIndex] || '',
      classIndex,
      offeringNames,
      notes: student.notes || ''
    })
  },

  onNameInput(event) { this.setData({ name: event.detail.value }) },
  onClassChange(event) {
    const classIndex = Number(event.detail.value)
    this.setData({ classIndex, className: this.data.offeringNames[classIndex] || '' })
  },
  onNotesInput(event) { this.setData({ notes: event.detail.value }) },

  save() {
    const ok = getApp().changeStudent(this.studentId, 'edit', {
      name: this.data.name,
      className: this.data.className,
      notes: this.data.notes
    })
    if (!ok) {
      wx.showToast({ title: '请填写姓名并选择课程', icon: 'none' })
      return
    }
    wx.showToast({ title: '资料已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 400)
  }
})
