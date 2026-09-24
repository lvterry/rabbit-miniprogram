const { colors } = require('../../utils/design-tokens')
const COLORS = colors.chart

Page({
  data: { totalText: '0', showClassBreakdown: false, classBreakdown: [], months: [] },

  onReady() {
    this.chartReady = true
    this.drawClassPie()
  },

  onShow() {
    const { offerings, revenueRecords } = getApp().store
    const total = revenueRecords.reduce((sum, record) => sum + record.amount, 0)
    const classBreakdown = offerings.map((offering, index) => {
      const amount = revenueRecords.filter(record => record.offeringId === offering.id).reduce((sum, record) => sum + record.amount, 0)
      return { id: offering.id, name: offering.name, amount, amountText: amount.toLocaleString('zh-CN'), color: COLORS[index % COLORS.length], percent: total ? Math.round(amount / total * 100) : 0 }
    }).filter(item => item.amount > 0)
    const groupedMonths = {}
    revenueRecords.forEach(record => {
      const month = record.date.slice(0, 7)
      groupedMonths[month] = (groupedMonths[month] || 0) + record.amount
    })
    const max = Math.max(1, ...Object.values(groupedMonths))
    const months = Object.keys(groupedMonths).sort().map(month => ({
      key: month,
      label: `${Number(month.slice(5))}月`,
      amount: groupedMonths[month],
      amountText: groupedMonths[month].toLocaleString('zh-CN'),
      height: Math.max(4, Math.round(groupedMonths[month] / max * 100)),
      labelBottom: Math.round(Math.max(4, groupedMonths[month] / max * 100) * 2.2 + 8)
    }))
    this.setData({
      totalText: total.toLocaleString('zh-CN'),
      showClassBreakdown: offerings.length > 1 && classBreakdown.length > 0,
      classBreakdown,
      months
    }, () => { if (this.chartReady) this.drawClassPie() })
  },

  drawClassPie() {
    if (!this.data.showClassBreakdown) return
    wx.createSelectorQuery().in(this).select('#classPie').fields({ node: true, size: true }).exec(result => {
      const chart = result && result[0]
      if (!chart || !chart.node) return
      const canvas = chart.node
      const ratio = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
      canvas.width = chart.width * ratio
      canvas.height = chart.height * ratio
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      const centerX = chart.width / 2
      const centerY = chart.height / 2
      const radius = Math.min(centerX, centerY) - 4
      const total = this.data.classBreakdown.reduce((sum, item) => sum + item.amount, 0)
      let start = -Math.PI / 2
      this.data.classBreakdown.forEach(item => {
        const end = start + item.amount / total * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.arc(centerX, centerY, radius, start, end)
        ctx.closePath()
        ctx.fillStyle = item.color
        ctx.fill()
        start = end
      })
    })
  }
})
