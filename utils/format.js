const { todayKey, dateAfter } = require('./date')

function shortDate(value) {
  const parts = value.split('-')
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function relativeDate(value) {
  if (value === todayKey()) return '今天'
  if (value === dateAfter(1)) return '明天'
  return shortDate(value)
}

function weekday(value) {
  const [year, month, day] = value.split('-').map(Number)
  return '周' + '日一二三四五六'[new Date(year, month - 1, day).getDay()]
}

function timestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function viewClass(item) {
  return {
    ...item,
    dateLabel: relativeDate(item.date),
    dateFullLabel: `${shortDate(item.date)} ${weekday(item.date)}`,
    timeLabel: `${item.start}–${item.endDate && item.endDate !== item.date ? `次日 ${item.end}` : item.end}`,
    statusLabel: item.status === 'cancelled' ? '已取消' : item.status === 'completed' ? '已完成' : '待上课',
    creditHintVisible: item.creditConsumed && item.status !== 'completed',
    creditSummary: (item.students || []).map(student => {
      const consumed = student.creditConsumed ? '已消耗 1 课时' : item.status === 'cancelled' ? '未消耗课时' : '将消耗 1 课时'
      return `${(item.students || []).length > 1 ? `${student.name}：` : ''}${consumed} ・ 剩余 ${student.remainingCredits} 次`
    }).join('；')
  }
}

module.exports = { shortDate, relativeDate, weekday, timestamp, viewClass }
