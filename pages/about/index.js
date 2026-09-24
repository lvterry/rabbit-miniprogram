Page({
  data: { feedbackOpen: false, feedbackText: '' },

  openFeedback() { this.setData({ feedbackOpen: true, feedbackText: '' }) },
  closeFeedback() { this.setData({ feedbackOpen: false }) },
  onFeedbackInput(event) { this.setData({ feedbackText: event.detail.value }) },

  submitFeedback() {
    if (!getApp().addFeedback(this.data.feedbackText)) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    this.closeFeedback()
    wx.showToast({ title: '反馈已记录', icon: 'success' })
  }
})
