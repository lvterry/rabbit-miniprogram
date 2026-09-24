Page({
  data: { loggedIn: false, name: '', initial: '', loggingIn: false },

  onShow() {
    const profile = getApp().store.profile
    this.setData({ loggedIn: profile.loggedIn, name: profile.name, initial: profile.name.slice(0, 1) })
  },

  login() {
    if (this.data.loggingIn) return
    this.setData({ loggingIn: true })
    const finish = () => {
      getApp().loginDemo()
      this.onShow()
      this.setData({ loggingIn: false })
      wx.showToast({ title: '已进入演示账号', icon: 'none' })
    }
    wx.login({ success: finish, fail: finish })
  },

  logout() {
    getApp().logoutDemo()
    this.onShow()
    wx.showToast({ title: '已退出登录', icon: 'none' })
  },

  openPage(event) {
    wx.navigateTo({ url: `/pages/${event.currentTarget.dataset.page}/index` })
  }
})
