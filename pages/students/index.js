Page({
  data: {
    activeStudents: [],
    inactiveStudents: [],
    addSheet: false,
    newName: '',
    newClassName: '西语 1 对 1',
    newNotes: ''
  },

  onShow() { this.refresh() },

  refresh() {
    const students = getApp().store.students
    this.setData({
      activeStudents: students.filter(item => item.isActive),
      inactiveStudents: students.filter(item => !item.isActive)
    })
  },

  openStudent(event) {
    wx.navigateTo({ url: `/pages/student-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  openAddSheet() {
    this.setData({ addSheet: true, newName: '', newClassName: '西语 1 对 1', newNotes: '' })
  },

  closeAddSheet() { this.setData({ addSheet: false }) },
  onNameInput(event) { this.setData({ newName: event.detail.value }) },
  onClassInput(event) { this.setData({ newClassName: event.detail.value }) },
  onNotesInput(event) { this.setData({ newNotes: event.detail.value }) },

  createStudent() {
    const student = getApp().addStudent({ name: this.data.newName, className: this.data.newClassName, notes: this.data.newNotes })
    if (!student) {
      wx.showToast({ title: '请填写姓名和课程', icon: 'none' })
      return
    }
    this.setData({ addSheet: false })
    this.refresh()
    wx.navigateTo({ url: `/pages/student-detail/index?id=${student.id}` })
  }
})
