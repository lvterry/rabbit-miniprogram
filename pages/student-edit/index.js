const { getStudent, updateStudent } = require('../../utils/student-api')
const { listCourses } = require('../../utils/course-api')

Page({
  data: { studentId: '', name: '', className: '', classIndex: 0, offeringNames: [], courseId: '', notes: '', source: '', loading: false, saving: false, error: '' },

  onLoad(options) {
    this.studentId = options.id
    this.refresh()
  },

  refresh() {
    const app = getApp()
    const student = app.getStudent(this.studentId)
    if (!student) {
      this.setData({ loading: true, error: '' })
      return Promise.all([getStudent(this.studentId), listCourses()])
        .then(([cloudStudent, courses]) => {
          this.courses = courses
          const offeringNames = ['暂不关联课程', ...courses.map(course => course.name)]
          const selectedCourseIndex = courses.findIndex(course => course.id === cloudStudent.courseId)
          const classIndex = selectedCourseIndex >= 0 ? selectedCourseIndex + 1 : 0
          this.setData({
            source: 'cloud',
            name: cloudStudent.name,
            className: cloudStudent.courseName || '',
            classIndex,
            offeringNames,
            courseId: selectedCourseIndex >= 0 ? cloudStudent.courseId : '',
            notes: cloudStudent.notes || '',
            loading: false
          })
        })
        .catch(error => {
          const message = error.statusCode === 404 ? '学员或课程不存在' : '云端资料加载失败，请重试'
          this.setData({ loading: false, error: message })
        })
    }
    const offeringNames = app.store.offerings.map(item => item.name)
    const currentIndex = offeringNames.indexOf(student.className)
    const classIndex = currentIndex >= 0 ? currentIndex : 0
    this.setData({
      source: 'local',
      name: student.name,
      className: offeringNames[classIndex] || '',
      classIndex,
      offeringNames,
      courseId: '',
      notes: student.notes || ''
    })
  },

  onNameInput(event) { this.setData({ name: event.detail.value }) },
  onClassChange(event) {
    const classIndex = Number(event.detail.value)
    if (this.data.source === 'cloud') {
      const course = classIndex > 0 ? this.courses[classIndex - 1] : null
      this.setData({ classIndex, className: course ? course.name : '', courseId: course ? course.id : '' })
      return
    }
    this.setData({ classIndex, className: this.data.offeringNames[classIndex] || '' })
  },
  onNotesInput(event) { this.setData({ notes: event.detail.value }) },

  save() {
    if (this.data.saving) return
    if (this.data.source === 'cloud') {
      const name = this.data.name.trim()
      if (!name) {
        this.setData({ error: '请填写学员姓名' })
        return
      }
      this.setData({ saving: true, error: '' })
      return updateStudent(this.studentId, {
        name,
        courseId: this.data.courseId,
        notes: this.data.notes.trim()
      })
        .then(() => {
          wx.showToast({ title: '资料已保存到云端', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 400)
        })
        .catch(error => {
          let message = '资料保存失败，请检查填写内容'
          if (error.statusCode === 404) {
            message = error.message === 'Course not found' ? '课程已失效，请重新选择' : '找不到这位学员'
          }
          this.setData({ saving: false, error: message })
        })
    }
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
