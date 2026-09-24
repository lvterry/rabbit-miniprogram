Page({
  data: { name: '', description: '', posterOpen: false, saving: false },

  onLoad(options) {
    this.offeringId = options.id || ''
    wx.setNavigationBarTitle({ title: this.offeringId ? '编辑课程' : '添加课程' })
    if (!this.offeringId) return
    const offering = getApp().getOffering(this.offeringId)
    if (offering) this.setData({ name: offering.name, description: offering.description })
  },

  onNameInput(event) { this.setData({ name: event.detail.value }) },
  onDescriptionInput(event) { this.setData({ description: event.detail.value }) },

  save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    const offering = getApp().saveOffering(this.offeringId, this.data)
    if (!offering) {
      this.setData({ saving: false })
      wx.showToast({ title: '请填写不重复的课程名称', icon: 'none' })
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
