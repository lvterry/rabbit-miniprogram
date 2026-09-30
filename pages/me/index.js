const { getProfile, clearMyData, loginWithPhone } = require('../../utils/account-api')

Page({
  data: { showAccount: false, profile: null, loading: false, error: '', signingIn: false,
    clearingData: false, clearError: '' },
  onShow() { if (this.data.showAccount) this.loadProfile() },
  loadProfile() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getProfile().then(profile => {
      if (requestId === this.requestId) this.setData({ profile, loading: false })
    }).catch(error => {
      if (requestId === this.requestId) this.setData({ profile: null, loading: false,
        error: error.statusCode === 401 ? '无法识别微信用户，请重试' : '账号资料加载失败，请重试' })
    })
  },
  onGetPhoneNumber(event) {
    if (this.data.signingIn) return
    const code = event.detail && event.detail.code
    if (!code) {
      const denied = /deny|cancel/i.test((event.detail && event.detail.errMsg) || '')
      wx.showToast({ title: denied ? '已取消手机号授权' : '未获取到手机号，请重试', icon: 'none' })
      return
    }
    this.requestId = (this.requestId || 0) + 1
    this.setData({ signingIn: true, loading: false, error: '' })
    return loginWithPhone(code).then(profile => {
      this.setData({ profile, signingIn: false })
      wx.showToast({ title: '登录成功', icon: 'success' })
    }).catch(error => {
      this.setData({ signingIn: false })
      const title = error.code === 'PHONE_SERVICE_UNAVAILABLE' ? '手机号服务暂不可用，请稍后重试'
        : error.code === 'PHONE_AUTH_INVALID' ? '授权已失效，请重新授权' : '登录失败，请重试'
      wx.showToast({ title, icon: 'none' })
      // A lost response may occur after the binding was saved; recover the server state.
      return this.loadProfile()
    })
  },
  confirmClearData() {
    if (this.data.clearingData) return
    wx.showModal({
      title: '清空所有数据',
      content: '将永久删除当前微信账号的课程、学员、课次、课时、收款、账号资料和反馈，无法恢复。确认后将返回首页。',
      confirmText: '确认清空',
      confirmColor: '#aa7042',
      success: result => { if (result.confirm) this.clearData() }
    })
  },
  clearData() {
    if (this.data.clearingData) return
    this.setData({ clearingData: true, clearError: '' })
    return clearMyData().then(() => {
      try { wx.removeStorageSync('xiaotu-pending-requests-v1') } catch (_) {}
      wx.reLaunch({ url: '/pages/today/index', fail: () => {
        this.setData({ clearingData: false, clearError: '数据已清空，请手动返回首页' })
      } })
    }, error => {
      this.setData({ clearingData: false,
        clearError: error.statusCode === 401 ? '无法识别微信用户，请重试' : '清空失败，请稍后重试' })
    })
  },
  openPage(event) { wx.navigateTo({ url: `/pages/${event.currentTarget.dataset.page}/index` }) }
})
