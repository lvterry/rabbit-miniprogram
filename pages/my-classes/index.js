const { listCourses } = require('../../utils/course-api')

Page({
  data: { courses: [], loading: false, error: '' },

  onShow() { this.loadCourses() },

  loadCourses() {
    const requestId = (this.courseRequestId || 0) + 1
    this.courseRequestId = requestId
    this.setData({ courses: [], loading: true, error: '' })

    return listCourses()
      .then(courses => {
        if (requestId === this.courseRequestId) this.setData({ courses, loading: false })
      })
      .catch(error => {
        if (requestId !== this.courseRequestId) return
        let message = '云端课程加载失败，请重试'
        if (error.statusCode === 401) message = '无法识别微信用户，请重试'
        if (error.statusCode === 404) message = '课程服务尚未部署'
        this.setData({ loading: false, error: message })
      })
  },

  addClass() { wx.navigateTo({ url: '/pages/class-editor/index' }) }
})
