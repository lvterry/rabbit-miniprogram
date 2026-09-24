Page({
  data: { offerings: [], rosterOpen: false, roster: [], rosterTitle: '' },

  onShow() {
    const app = getApp()
    this.setData({
      offerings: app.store.offerings.map(item => ({
        ...item,
        studentCount: item.studentIds.filter(id => !!app.getStudent(id)).length
      }))
    })
  },

  openRoster(event) {
    const offering = getApp().getOffering(event.currentTarget.dataset.id)
    if (!offering) return
    const roster = offering.studentIds.map(id => getApp().getStudent(id)).filter(Boolean)
    this.setData({ rosterOpen: true, roster, rosterTitle: `${offering.name}的学员` })
  },

  closeRoster() { this.setData({ rosterOpen: false }) },

  openStudent(event) {
    this.closeRoster()
    wx.navigateTo({ url: `/pages/student-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  editClass(event) {
    wx.navigateTo({ url: `/pages/class-editor/index?id=${event.currentTarget.dataset.id}` })
  },

  addClass() { wx.navigateTo({ url: '/pages/class-editor/index' }) }
})
