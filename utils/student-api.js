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

function getStudent(id) {
  return requestCloudApi({ path: `/students/${encodeURIComponent(id)}`, method: 'GET' }).then(data => {
    if (!data || !data.student) throw new Error('Invalid student response')
    return data.student
  })
}

function updateStudent(id, fields) {
  return requestCloudApi({ path: `/students/${encodeURIComponent(id)}`, method: 'PATCH', data: fields })
    .then(data => data.student)
}

function addStudentCredits(id, fields) {
  return requestCloudApi({ path: `/students/${encodeURIComponent(id)}/credits`, method: 'POST', data: fields })
    .then(data => data.student)
}

function addStudentAppointment(id, fields) {
  return requestCloudApi({ path: `/students/${encodeURIComponent(id)}/appointments`, method: 'POST', data: fields })
    .then(data => data.student)
}

module.exports = { listStudents, createStudent, getStudent, updateStudent, addStudentCredits, addStudentAppointment }
