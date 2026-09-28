const { listCourses } = require('../../utils/course-api')
const { listStudents } = require('../../utils/student-api')

Page({
  data: {
    courses: [], loading: false, error: '',
    studentSheetOpen: false, selectedCourseName: '', selectedStudents: []
  },

  onShow() { this.loadCourses() },

  loadCourses() {
    const requestId = (this.courseRequestId || 0) + 1
    this.courseRequestId = requestId
    this.setData({ courses: [], loading: true, error: '' })

    return Promise.all([listCourses(), listStudents()])
      .then(([courses, students]) => {
        if (requestId !== this.courseRequestId) return
        const coursesWithStudents = courses.map(course => {
          const courseStudents = students.filter(student => student.courseId === course.id)
          return {
            ...course,
            students: courseStudents.map(student => ({ ...student, initial: student.name.slice(0, 1) })),
            studentCount: courseStudents.length
          }
        })
        this.setData({ courses: coursesWithStudents, loading: false })
      })
      .catch(error => {
        if (requestId !== this.courseRequestId) return
        let message = '云端课程加载失败，请重试'
        if (error.statusCode === 401) message = '无法识别微信用户，请重试'
        if (error.statusCode === 404) message = '课程或学员服务尚未部署'
        this.setData({ loading: false, error: message })
      })
  },

  openStudentSheet(event) {
    const course = this.data.courses.find(item => item.id === event.currentTarget.dataset.id)
    if (!course) return
    this.setData({
      studentSheetOpen: true,
      selectedCourseName: course.name,
      selectedStudents: course.students
    })
  },

  closeStudentSheet() { this.setData({ studentSheetOpen: false }) },

  editCourse(event) {
    wx.navigateTo({ url: `/pages/class-editor/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` })
  },

  addClass() { wx.navigateTo({ url: '/pages/class-editor/index' }) }
})
