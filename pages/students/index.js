const { listCourses } = require('../../utils/course-api')
const { listStudents, createStudent } = require('../../utils/student-api')

Page({
  data: {
    activeStudents: [], inactiveStudents: [], loading: false, error: '',
    addSheet: false, courses: [], courseOptions: [{ name: '暂不关联课程' }], coursesLoading: false, coursesError: '',
    newName: '', newCourseId: '', newCourseName: '', newCourseIndex: 0, newNotes: '',
    formError: '', saving: false
  },

  onShow() { this.loadStudents() },

  loadStudents() {
    const requestId = (this.studentRequestId || 0) + 1
    this.studentRequestId = requestId
    this.setData({ loading: true, error: '' })
    return listStudents()
      .then(students => {
        if (requestId !== this.studentRequestId) return
        const displayStudents = students.map(student => ({ ...student, initial: student.name.slice(0, 1) }))
        this.setData({
          activeStudents: displayStudents.filter(student => student.isActive),
          inactiveStudents: displayStudents.filter(student => !student.isActive),
          loading: false
        })
      })
      .catch(error => {
        if (requestId !== this.studentRequestId) return
        let message = '云端学员加载失败，请重试'
        if (error.statusCode === 401) message = '无法识别微信用户，请重试'
        if (error.statusCode === 404) message = '学员服务尚未部署'
        this.setData({ activeStudents: [], inactiveStudents: [], loading: false, error: message })
      })
  },

  openStudent(event) {
    wx.navigateTo({ url: `/pages/student-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  openAddSheet() {
    this.setData({
      addSheet: true, courses: [], courseOptions: [{ name: '暂不关联课程' }], coursesError: '',
      newName: '', newCourseId: '', newCourseName: '', newCourseIndex: 0, newNotes: '', formError: ''
    })
    this.loadCourses()
  },

  closeAddSheet() {
    if (this.data.saving) return
    this.courseRequestId = (this.courseRequestId || 0) + 1
    this.setData({ addSheet: false })
  },

  loadCourses() {
    const requestId = (this.courseRequestId || 0) + 1
    this.courseRequestId = requestId
    this.setData({ coursesLoading: true, coursesError: '' })
    return listCourses()
      .then(courses => {
        if (requestId === this.courseRequestId) {
          this.setData({ courses, courseOptions: [{ name: '暂不关联课程' }, ...courses], coursesLoading: false })
        }
      })
      .catch(() => {
        if (requestId === this.courseRequestId) {
          this.setData({ courses: [], coursesLoading: false, coursesError: '云端课程加载失败，请重试' })
        }
      })
  },

  goAddCourse() {
    this.closeAddSheet()
    wx.navigateTo({ url: '/pages/class-editor/index' })
  },

  onNameInput(event) { this.setData({ newName: event.detail.value, formError: '' }) },
  onNotesInput(event) { this.setData({ newNotes: event.detail.value, formError: '' }) },
  onCourseChange(event) {
    const index = Number(event.detail.value)
    if (index === 0) {
      this.setData({ newCourseIndex: 0, newCourseId: '', newCourseName: '', formError: '' })
      return
    }
    const course = this.data.courses[index - 1]
    if (course) this.setData({ newCourseIndex: index, newCourseId: course.id, newCourseName: course.name, formError: '' })
  },

  createStudent() {
    if (this.data.saving) return
    const name = this.data.newName.trim()
    if (!name) {
      this.setData({ formError: '请填写学员姓名' })
      return
    }
    this.setData({ saving: true, formError: '' })
    return createStudent({ name, courseId: this.data.newCourseId, notes: this.data.newNotes.trim() })
      .then(() => {
        this.setData({ saving: false, addSheet: false })
        wx.showToast({ title: '学员已保存到云端', icon: 'success' })
        return this.loadStudents()
      })
      .catch(error => {
        let message = '云端保存失败，请稍后重试'
        if (error.statusCode === 401) message = '无法识别微信用户，请重试'
        if (error.statusCode === 404) {
          message = error.message === 'Course not found' ? '所选课程已失效，请重新选择' : '学员服务尚未部署'
        }
        if (error.statusCode === 400) message = '请检查学员姓名和备注'
        this.setData({ saving: false, formError: message })
      })
  }
})
