const { requestCloudApi, mutateCloudApi } = require('./cloud-api')
const { todayKey } = require('./date')

function listSessions() {
  return requestCloudApi({ path: `/sessions?from=${todayKey()}`, method: 'GET' }).then(data => {
    if (!data || !Array.isArray(data.sessions)) throw new Error('Invalid session list response')
    return data.sessions
  })
}

function getSession(id) {
  return requestCloudApi({ path: `/sessions/${encodeURIComponent(id)}`, method: 'GET' }).then(data => {
    if (!data || !data.session) throw new Error('Invalid session response')
    return data.session
  })
}

function changeSession(id, fields) {
  return mutateCloudApi(`session:${id}`, { path: `/sessions/${encodeURIComponent(id)}/actions`, method: 'POST', data: fields }).then(data => {
    if (!data || !data.session) throw new Error('Invalid session response')
    return data.session
  })
}

module.exports = { listSessions, getSession, changeSession }
