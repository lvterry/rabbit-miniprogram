const { getStudent, updateStudent } = require('../../utils/student-api')
const { listCourses } = require('../../utils/course-api')

Page({
  data: { studentId: '', name: '', className: '', classIndex: 0, offeringNames: [], courseId: '', notes: '', loading: false, loaded: false, saving: false, error: '' },

  onLoad(options) {
    this.studentId = options.id
    this.refresh()
  },

  refresh() {
    this.setData({ loading: true, loaded: false, error: '' })
    return Promise.all([getStudent(this.studentId), listCourses()])
      .then(([cloudStudent, courses]) => {
        this.courses = courses
        const offeringNames = ['暂不关联课程', ...courses.map(course => course.name)]
        const selectedCourseIndex = courses.findIndex(course => course.id === cloudStudent.courseId)
        const classIndex = selectedCourseIndex >= 0 ? selectedCourseIndex + 1 : 0
        this.setData({
          name: cloudStudent.name,
          className: cloudStudent.courseName || '',
          classIndex,
          offeringNames,
          courseId: selectedCourseIndex >= 0 ? cloudStudent.courseId : '',
          notes: cloudStudent.notes || '',
          loading: false, loaded: true
        })
      })
      .catch(error => {
        const message = error.statusCode === 404 ? '学员或课程不存在' : '云端资料加载失败，请重试'
        this.setData({ loading: false, error: message })
      })
  },

  onNameInput(event) { this.setData({ name: event.detail.value }) },
  onClassChange(event) {
    const classIndex = Number(event.detail.value)
    const course = classIndex > 0 ? (this.courses || [])[classIndex - 1] : null
    this.setData({ classIndex, className: course ? course.name : '', courseId: course ? course.id : '' })
  },
  onNotesInput(event) { this.setData({ notes: event.detail.value }) },

  save() {
    if (this.data.saving || !this.data.loaded) return
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
})
