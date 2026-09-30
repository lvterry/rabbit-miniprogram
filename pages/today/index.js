const { todayKey } = require('../../utils/date')
const { shortDate, weekday, viewClass } = require('../../utils/format')
const { listSessions } = require('../../utils/session-api')
const { listCourses, createCourse } = require('../../utils/course-api')
const { listStudents, createStudent } = require('../../utils/student-api')

Page({
  data: {
    today: [], upcoming: [], dateText: '', count: 0, loading: false, error: '',
    onboardingStep: '', courseName: '', courseDescription: '', courseNameError: '', courseSaveError: '',
    studentName: '', studentNotes: '', studentNameError: '', studentSaveError: '',
    onboardingCourseId: '', onboardingCourseName: '', onboardingSaving: false
  },
  onShow() {
    this.pageVisible = true
    return Promise.all([this.loadSessions(), this.checkOnboarding()])
  },
  onHide() {
    this.pageVisible = false
    this.onboardingRequestId = (this.onboardingRequestId || 0) + 1
  },
  onUnload() { this.onHide() },

  checkOnboarding() {
    if (this.onboardingDismissed || this.data.onboardingStep) return Promise.resolve()
    const requestId = (this.onboardingRequestId || 0) + 1
    this.onboardingRequestId = requestId
    return Promise.all([listCourses(), listStudents()])
      .then(([courses, students]) => {
        if (requestId !== this.onboardingRequestId || !this.pageVisible || this.onboardingDismissed) return
        if (courses.length === 0 && students.length === 0) {
          this.setData({ onboardingStep: 'course', courseName: '', courseDescription: '', courseNameError: '', courseSaveError: '' })
        }
      })
      .catch(() => {
        // A failed lookup cannot establish that the account is empty.
      })
  },

  closeOnboarding() {
    if (this.data.onboardingSaving) return
    this.onboardingDismissed = true
    this.setData({ onboardingStep: '' })
  },
  onCourseNameInput(event) { this.setData({ courseName: event.detail.value, courseNameError: '', courseSaveError: '' }) },
  onCourseDescriptionInput(event) { this.setData({ courseDescription: event.detail.value, courseSaveError: '' }) },
  onStudentNameInput(event) { this.setData({ studentName: event.detail.value, studentNameError: '', studentSaveError: '' }) },
  onStudentNotesInput(event) { this.setData({ studentNotes: event.detail.value, studentSaveError: '' }) },

  saveOnboardingCourse() {
    if (this.data.onboardingStep !== 'course' || this.data.onboardingSaving) return
    const name = this.data.courseName.trim()
    if (!name) {
      this.setData({ courseNameError: '请填写课程名称' })
      return
    }
    this.setData({ onboardingSaving: true, courseNameError: '', courseSaveError: '' })
    return createCourse({ name, description: this.data.courseDescription.trim() })
      .then(course => {
        this.onboardingDismissed = true
        this.setData({
          onboardingStep: 'student', onboardingSaving: false,
          onboardingCourseId: course.id, onboardingCourseName: course.name || name,
          studentName: '', studentNotes: '', studentNameError: '', studentSaveError: ''
        })
      })
      .catch(error => {
        this.setData({
          onboardingSaving: false,
          courseNameError: error.statusCode === 409 ? '课程名称已存在' : '',
          courseSaveError: error.statusCode === 409 ? '' : error.statusCode === 401
            ? '无法识别微信用户，请重试' : '课程保存失败，请稍后重试'
        })
      })
  },

  saveOnboardingStudent() {
    if (this.data.onboardingStep !== 'student' || this.data.onboardingSaving) return
    const name = this.data.studentName.trim()
    if (!name) {
      this.setData({ studentNameError: '请填写学员姓名' })
      return
    }
    this.setData({ onboardingSaving: true, studentNameError: '', studentSaveError: '' })
    return createStudent({ name, courseId: this.data.onboardingCourseId, notes: this.data.studentNotes.trim() })
      .then(student => {
        this.setData({ onboardingStep: '', onboardingSaving: false })
        wx.navigateTo({ url: `/pages/student-detail/index?id=${encodeURIComponent(student.id)}` })
      })
      .catch(error => {
        this.setData({ onboardingSaving: false,
          studentSaveError: error.statusCode === 401 ? '无法识别微信用户，请重试'
            : error.statusCode === 404 ? '课程已失效，请稍后重试' : '学员保存失败，请稍后重试' })
      })
  },
  loadSessions() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    const today = todayKey()
    this.setData({ loading: true, error: '', dateText: `${shortDate(today)} · ${weekday(today)}` })
    return listSessions().then(classes => {
      if (requestId !== this.requestId) return
      this.setData({ today: classes.filter(item => item.date === today).map(viewClass),
        upcoming: classes.filter(item => item.date > today).map(viewClass),
        count: classes.filter(item => item.date === today && item.status !== 'cancelled').length, loading: false })
    }).catch(error => {
      if (requestId !== this.requestId) return
      this.setData({ today: [], upcoming: [], count: 0, loading: false,
        error: error.statusCode === 401 ? '无法识别微信用户，请重试' : '课程安排加载失败，请重试' })
    })
  },
  openDetail(event) { wx.navigateTo({ url: `/pages/class-detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) }
})
