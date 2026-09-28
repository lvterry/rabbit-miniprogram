const { requestCloudApi, mutateCloudApi } = require('./cloud-api')

function profileFrom(data) {
  if (!data || !data.profile) throw new Error('Invalid profile response')
  return data.profile
}
function getProfile() { return requestCloudApi({ path: '/me', method: 'GET' }).then(profileFrom) }
function updateProfile(name) { return requestCloudApi({ path: '/me', method: 'PATCH', data: { name } }).then(profileFrom) }
function submitFeedback(message) { return mutateCloudApi('feedback', { path: '/feedback', method: 'POST', data: { message } }) }
function getRevenueReport() {
  return requestCloudApi({ path: '/reports/revenue', method: 'GET' }).then(data => {
    if (!data || !data.report || !Array.isArray(data.report.months) || !Array.isArray(data.report.classBreakdown)) throw new Error('Invalid report response')
    return data.report
  })
}
module.exports = { getProfile, updateProfile, submitFeedback, getRevenueReport }
