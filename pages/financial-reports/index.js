const { colors } = require('../../utils/design-tokens')
const COLORS = colors.chart
const { getRevenueReport } = require('../../utils/account-api')

Page({
  data: { totalText: '0', showClassBreakdown: false, classBreakdown: [], months: [], loading: false, error: '', period: '' },

  onReady() {
    this.chartReady = true
    this.drawClassPie()
  },

  onShow() { this.loadReport() },

  loadReport() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getRevenueReport().then(report => {
      if (requestId !== this.requestId) return
      const total = report.total
      const classBreakdown = report.classBreakdown.map((course, index) => ({ ...course,
        amountText: course.amount.toLocaleString('zh-CN'), color: COLORS[index % COLORS.length],
        percent: total ? Math.round(course.amount / total * 100) : 0 }))
      const max = Math.max(1, ...report.months.map(month => month.amount))
      const months = report.months.map(month => ({ ...month, label: `${Number(month.key.slice(5))}月`,
        amountText: month.amount.toLocaleString('zh-CN'), height: Math.round(month.amount / max * 100),
        labelBottom: Math.round(month.amount / max * 220 + 8) }))
      this.setData({ totalText: total.toLocaleString('zh-CN'), showClassBreakdown: classBreakdown.length > 1,
        classBreakdown, months, loading: false, period: `${report.startDate} 至 ${report.endDate}` },
      () => { if (this.chartReady) this.drawClassPie() })
    }).catch(error => {
      if (requestId !== this.requestId) return
      this.setData({ loading: false, error: error.statusCode === 401 ? '无法识别微信用户，请重试' : '收入报表加载失败，请重试',
        totalText: '0', months: [], classBreakdown: [], showClassBreakdown: false })
    })
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
