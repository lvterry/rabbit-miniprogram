const { getProfile, updateProfile } = require('../../utils/account-api')

Page({
  data: { showAccount: false, profile: null, loading: false, error: '', initial: '', editOpen: false, draftName: '', saving: false, formError: '' },
  onShow() { if (this.data.showAccount) this.loadProfile() },
  loadProfile() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getProfile().then(profile => {
      if (requestId === this.requestId) this.setData({ profile, initial: profile.name.slice(0, 1), loading: false })
    }).catch(error => {
      if (requestId === this.requestId) this.setData({ profile: null, loading: false,
        error: error.statusCode === 401 ? '无法识别微信用户，请重试' : '账号资料加载失败，请重试' })
    })
  },
  editProfile() { if (this.data.profile) this.setData({ editOpen: true, draftName: this.data.profile.name, formError: '' }) },
  closeEdit() { if (!this.data.saving) this.setData({ editOpen: false }) },
  onNameInput(event) { this.setData({ draftName: event.detail.value, formError: '' }) },
  saveProfile() {
    if (this.data.saving) return
    const name = this.data.draftName.trim()
    if (!name) { this.setData({ formError: '请填写姓名' }); return }
    this.setData({ saving: true, formError: '' })
    return updateProfile(name).then(profile => {
      this.setData({ profile, initial: profile.name.slice(0, 1), editOpen: false, saving: false })
      wx.showToast({ title: '姓名已保存', icon: 'success' })
    }).catch(() => this.setData({ saving: false, formError: '保存失败，请重试' }))
  },
  openPage(event) { wx.navigateTo({ url: `/pages/${event.currentTarget.dataset.page}/index` }) }
})
