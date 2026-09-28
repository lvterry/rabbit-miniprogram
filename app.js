const { CLOUD_SERVICE, initCloud, callCloudContainer } = require('./utils/cloud')

App({
  onLaunch() { initCloud() },

  testCloudConnection() {
    return Promise.resolve()
      .then(() => callCloudContainer({ path: '/health', method: 'GET' }))
      .then(response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new Error(`Cloud Run returned HTTP ${response.statusCode}`)
        }
        console.log(`[Cloud Run] health check succeeded (Mini Program → wx.cloud.callContainer → ${CLOUD_SERVICE}):`, response)
        return response
      })
      .catch(error => {
        console.error('[Cloud Run] Connection test failed:', error)
        throw error
      })
  }
})
