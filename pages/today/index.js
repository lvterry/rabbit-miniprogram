const { todayKey } = require('../../utils/date')
const { shortDate, weekday, viewClass } = require('../../utils/format')
const { listSessions } = require('../../utils/session-api')

Page({
  data: { today: [], upcoming: [], dateText: '', count: 0, loading: false, error: '' },
  onShow() { this.loadSessions() },
  loadSessions() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    const today = todayKey()
    this.setData({ loading: true, error: '', dateText: `${shortDate(today)} · ${weekday(today)}` })
    return listSessions().then(classes => {
      if (requestId !== this.requestId) return
      this.setData({ today: classes.filter(item => item.date === today).map(viewClass),
        upcoming: classes.filter(item => item.date > today).map(viewClass),
        count: classes.filter(item => item.date === today && item.status !== 'cancelled').length, loading: false })
    }).catch(error => {
      if (requestId !== this.requestId) return
      this.setData({ today: [], upcoming: [], count: 0, loading: false,
        error: error.statusCode === 401 ? '无法识别微信用户，请重试' : '课程安排加载失败，请重试' })
    })
  },
  openDetail(event) { wx.navigateTo({ url: `/pages/class-detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) }
})
