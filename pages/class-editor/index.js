const { createCourse, getCourse, updateCourse } = require('../../utils/course-api')

Page({
  data: { name: '', description: '', posterOpen: false, saving: false, loading: false, loadError: '', nameError: '', saveError: '' },

  onLoad(options) {
    this.offeringId = options.id || ''
    wx.setNavigationBarTitle({ title: this.offeringId ? '编辑课程' : '添加课程' })
    if (!this.offeringId) return
    this.loadCloudCourse()
  },

  loadCloudCourse() {
    this.setData({ loading: true, loadError: '' })
    return getCourse(this.offeringId)
      .then(course => this.setData({ name: course.name, description: course.description || '', loading: false }))
      .catch(error => {
        this.setData({
          loading: false,
          loadError: error.statusCode === 404 ? '找不到这门课程' : '云端课程加载失败，请重试'
        })
      })
  },

  onNameInput(event) { this.setData({ name: event.detail.value, nameError: '', saveError: '' }) },
  onDescriptionInput(event) { this.setData({ description: event.detail.value, saveError: '' }) },

  save() {
    if (this.data.saving || this.data.loading || this.data.loadError) return
    const name = this.data.name.trim()
    const description = this.data.description.trim()
    if (!name) {
      this.setData({ nameError: '请填写课程名称' })
      return
    }

    if (!this.offeringId) {
      this.setData({ saving: true, nameError: '', saveError: '' })
      return createCourse({ name, description })
        .then(() => {
          wx.showToast({ title: '课程已保存到云端', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 400)
        })
        .catch(error => {
          const nameError = error.statusCode === 409 ? '课程名称已存在' : ''
          let saveError = ''
          if (!nameError) {
            saveError = error.statusCode === 401
              ? '无法识别微信用户，请重试'
              : '云端保存失败，请稍后重试'
          }
          this.setData({ saving: false, nameError, saveError })
        })
    }

    if (this.offeringId) {
      this.setData({ saving: true, nameError: '', saveError: '' })
      return updateCourse(this.offeringId, { name, description })
        .then(() => {
          wx.showToast({ title: '课程已更新到云端', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 400)
        })
        .catch(error => {
          const nameError = error.statusCode === 409 ? '课程名称已存在' : ''
          const saveError = nameError ? '' : error.statusCode === 404 ? '找不到这门课程' : '云端保存失败，请稍后重试'
          this.setData({ saving: false, nameError, saveError })
        })
    }
  },

  openPoster() {
    if (!this.data.name.trim()) {
      wx.showToast({ title: '请先填写课程名称', icon: 'none' })
      return
    }
    this.setData({ posterOpen: true })
  },
  closePoster() { this.setData({ posterOpen: false }) },

  onShareAppMessage() {
    return { title: `${this.data.name.trim()} · 小兔排课`, path: '/pages/my-classes/index' }
  }
})
