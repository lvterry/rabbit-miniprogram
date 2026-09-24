const { callCloudContainer } = require('./cloud')

function requestCloudApi(options) {
  return Promise.resolve()
    .then(() => callCloudContainer(options))
    .then(response => {
      const statusCode = response && response.statusCode
      if (typeof statusCode !== 'number' || statusCode < 200 || statusCode >= 300) {
        const error = new Error((response && response.data && response.data.error) || `HTTP ${statusCode}`)
        error.statusCode = statusCode
        throw error
      }
      return response.data
    })
}

module.exports = { requestCloudApi }
