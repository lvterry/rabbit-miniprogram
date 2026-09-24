const { requestCloudApi } = require('./cloud-api')

function createCourse({ name, description }) {
  return requestCloudApi({ path: '/courses', method: 'POST', data: { name, description } })
}

function listCourses() {
  return requestCloudApi({ path: '/courses', method: 'GET' }).then(data => {
    if (!data || !Array.isArray(data.courses)) throw new Error('Invalid course list response')
    return data.courses
  })
}

module.exports = { createCourse, listCourses }
