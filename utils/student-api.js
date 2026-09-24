const { requestCloudApi } = require('./cloud-api')

function listStudents() {
  return requestCloudApi({ path: '/students', method: 'GET' }).then(data => {
    if (!data || !Array.isArray(data.students)) throw new Error('Invalid student list response')
    return data.students
  })
}

function createStudent({ name, courseId, notes }) {
  return requestCloudApi({ path: '/students', method: 'POST', data: { name, courseId, notes } })
}

module.exports = { listStudents, createStudent }
