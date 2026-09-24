const CLOUD_ENV = 'prod-d8gfpc80m60219d51'
const CLOUD_SERVICE = 'express-2wy2'

function initCloud() {
  wx.cloud.init({ env: CLOUD_ENV })
}

function callCloudContainer({ path, method, data }) {
  return wx.cloud.callContainer({
    config: { env: CLOUD_ENV },
    path,
    method,
    data,
    header: { 'X-WX-SERVICE': CLOUD_SERVICE }
  })
}

module.exports = { CLOUD_SERVICE, initCloud, callCloudContainer }
