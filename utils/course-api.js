const { callCloudContainer } = require('./cloud')

function requestCourseApi(options) {
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

function createCourse({ name, description }) {
  return requestCourseApi({ path: '/courses', method: 'POST', data: { name, description } })
}

function listCourses() {
  return requestCourseApi({ path: '/courses', method: 'GET' }).then(data => {
    if (!data || !Array.isArray(data.courses)) throw new Error('Invalid course list response')
    return data.courses
  })
}

module.exports = { createCourse, listCourses }
