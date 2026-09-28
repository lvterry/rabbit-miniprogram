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

function getCourse(id) {
  return requestCloudApi({ path: `/courses/${encodeURIComponent(id)}`, method: 'GET' }).then(data => {
    if (!data || !data.course) throw new Error('Invalid course response')
    return data.course
  })
}

function updateCourse(id, { name, description }) {
  return requestCloudApi({
    path: `/courses/${encodeURIComponent(id)}`,
    method: 'PATCH',
    data: { name, description }
  }).then(data => {
    if (!data || !data.course) throw new Error('Invalid course response')
    return data.course
  })
}

module.exports = { createCourse, listCourses, getCourse, updateCourse }
