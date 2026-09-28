const { callCloudContainer } = require('./cloud')

function requestCloudApi(options) {
  return Promise.resolve().then(() => callCloudContainer(options)).then(response => {
    const statusCode = response && response.statusCode
    if (typeof statusCode !== 'number' || statusCode < 200 || statusCode >= 300) {
      const error = new Error((response && response.data && response.data.error) || `HTTP ${statusCode}`)
      error.statusCode = statusCode
      error.code = response && response.data && response.data.code
      throw error
    }
    return response.data
  })
}

// Only pending request identities are stored locally, so a lost response can be retried safely.
const PENDING_KEY = 'xiaotu-pending-requests-v1'
function mutateCloudApi(scope, options) {
  const signature = JSON.stringify([options.path, options.method, options.data])
  const pending = wx.getStorageSync(PENDING_KEY) || {}
  const previous = pending[scope]
  const requestId = previous && previous.signature === signature ? previous.requestId
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  pending[scope] = { signature, requestId }
  wx.setStorageSync(PENDING_KEY, pending)
  const clear = () => {
    const current = wx.getStorageSync(PENDING_KEY) || {}
    if (current[scope] && current[scope].requestId === requestId) {
      delete current[scope]
      wx.setStorageSync(PENDING_KEY, current)
    }
  }
  return requestCloudApi({ ...options, data: { ...options.data, requestId } })
    .then(data => { clear(); return data })
    .catch(error => {
      if (error.statusCode >= 400 && error.statusCode < 500) clear()
      throw error
    })
}

module.exports = { requestCloudApi, mutateCloudApi }
