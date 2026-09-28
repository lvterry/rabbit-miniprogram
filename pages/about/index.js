const { submitFeedback } = require('../../utils/account-api')

Page({
  data: { feedbackOpen: false, feedbackText: '', saving: false, error: '' },
  openFeedback() { this.setData({ feedbackOpen: true, feedbackText: '', error: '' }) },
  closeFeedback() { if (!this.data.saving) this.setData({ feedbackOpen: false }) },
  onFeedbackInput(event) { this.setData({ feedbackText: event.detail.value, error: '' }) },
  submitFeedback() {
    if (this.data.saving) return
    const message = this.data.feedbackText.trim()
    if (!message) { this.setData({ error: '请填写反馈内容' }); return }
    this.setData({ saving: true, error: '' })
    return submitFeedback(message).then(() => {
      this.setData({ saving: false, feedbackOpen: false })
      wx.showToast({ title: '反馈已提交', icon: 'success' })
    }).catch(() => this.setData({ saving: false, error: '反馈提交失败，请重试' }))
  }
})
