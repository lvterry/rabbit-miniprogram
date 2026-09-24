const { createCourse } = require('../../utils/course-api')

Page({
  data: { name: '', description: '', posterOpen: false, saving: false, nameError: '', saveError: '' },

  onLoad(options) {
    this.offeringId = options.id || ''
    wx.setNavigationBarTitle({ title: this.offeringId ? '编辑课程' : '添加课程' })
    if (!this.offeringId) return
    const offering = getApp().getOffering(this.offeringId)
    if (offering) this.setData({ name: offering.name, description: offering.description })
  },

  onNameInput(event) { this.setData({ name: event.detail.value, nameError: '', saveError: '' }) },
  onDescriptionInput(event) { this.setData({ description: event.detail.value, saveError: '' }) },

  save() {
    if (this.data.saving) return
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

    this.setData({ saving: true })
    const offering = getApp().saveOffering(this.offeringId, this.data)
    if (!offering) {
      this.setData({ saving: false, nameError: '请填写不重复的课程名称' })
      return
    }
    wx.showToast({ title: '课程已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 400)
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
