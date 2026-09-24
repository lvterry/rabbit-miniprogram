const { todayKey } = require('../../utils/mock')
const { shortDate, weekday, viewClass } = require('../../utils/format')

Page({
  data: { today: [], upcoming: [], dateText: '', count: 0 },

  onShow() {
    const classes = getApp().store.classes.slice().sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    const today = todayKey()
    const activeCount = classes.filter(item => item.date === today && item.status !== 'cancelled').length
    this.setData({
      today: classes.filter(item => item.date === today).map(viewClass),
      upcoming: classes.filter(item => item.date !== today).map(viewClass),
      dateText: `${shortDate(today)} · ${weekday(today)}`,
      count: activeCount
    })
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/class-detail/index?id=${event.currentTarget.dataset.id}` })
  }
})
