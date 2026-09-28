function pad(number) { return String(number).padStart(2, '0') }

function dateAfter(days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function todayKey() { return dateAfter(0) }

function displayTime(value) {
  const date = new Date(typeof value === 'string' ? value.replace(/(\.\d{3})\d+(?=Z$)/, '$1') : value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = { todayKey, dateAfter, displayTime }
