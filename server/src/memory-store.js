function createMemoryStore() {
  const courses = []
  const students = []

  function publicCourse(course) {
    const { ownerOpenid, ...fields } = course
    return fields
  }

  function publicStudent(student, includeDetails = false) {
    const course = courses.find(item => item.id === student.courseId && item.ownerOpenid === student.ownerOpenid)
    const { ownerOpenid, creditHistory, appointments, appointmentHistory, ...fields } = student
    const result = { ...fields, courseName: course ? course.name : '', isActive: !!course }
    if (includeDetails) Object.assign(result, { creditHistory, appointments, appointmentHistory })
    return result
  }

  function findCourse(ownerOpenid, courseId) {
    return courses.find(course => course.id === courseId && course.ownerOpenid === ownerOpenid)
  }

  function findStudent(ownerOpenid, studentId) {
    return students.find(student => student.id === studentId && student.ownerOpenid === ownerOpenid)
  }

  return {
    async initialize() {},
    async close() {},

    async listCourses(ownerOpenid) {
      return courses.filter(course => course.ownerOpenid === ownerOpenid).map(publicCourse)
    },

    async getCourse(ownerOpenid, courseId) {
      const course = findCourse(ownerOpenid, courseId)
      return course ? publicCourse(course) : null
    },

    async createCourse(course) {
      if (courses.some(item => item.ownerOpenid === course.ownerOpenid && item.name === course.name)) {
        const error = new Error('Course name already exists')
        error.code = 'COURSE_NAME_EXISTS'
        throw error
      }
      courses.push(course)
      return publicCourse(course)
    },

    async updateCourse(ownerOpenid, courseId, fields) {
      const course = findCourse(ownerOpenid, courseId)
      if (!course) return null
      if (courses.some(item => item.ownerOpenid === ownerOpenid && item.id !== courseId && item.name === fields.name)) {
        const error = new Error('Course name already exists')
        error.code = 'COURSE_NAME_EXISTS'
        throw error
      }
      Object.assign(course, fields)
      return publicCourse(course)
    },

    async listStudents(ownerOpenid) {
      return students.filter(student => student.ownerOpenid === ownerOpenid).map(student => publicStudent(student))
    },

    async createStudent(student) {
      if (student.courseId && !findCourse(student.ownerOpenid, student.courseId)) {
        const error = new Error('Course not found')
        error.code = 'COURSE_NOT_FOUND'
        throw error
      }
      students.unshift(student)
      return publicStudent(student)
    },

    async getStudent(ownerOpenid, studentId, includeDetails = true) {
      const student = findStudent(ownerOpenid, studentId)
      return student ? publicStudent(student, includeDetails) : null
    },

    async updateStudent(ownerOpenid, studentId, fields) {
      const student = findStudent(ownerOpenid, studentId)
      if (!student) return null
      if (fields.courseId && !findCourse(ownerOpenid, fields.courseId)) {
        const error = new Error('Course not found')
        error.code = 'COURSE_NOT_FOUND'
        throw error
      }
      Object.assign(student, fields)
      return publicStudent(student)
    },

    async addCredits(ownerOpenid, studentId, amount, fee, record) {
      const student = findStudent(ownerOpenid, studentId)
      if (!student) return null
      student.totalCredits += amount
      student.remainingCredits += amount
      student.creditHistory.unshift(record)
      return { student: publicStudent(student, true), record }
    },

    async addAppointment(ownerOpenid, studentId, appointment, record) {
      const student = findStudent(ownerOpenid, studentId)
      if (!student) return null
      student.appointments.push(appointment)
      student.appointments.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      student.appointmentHistory.unshift(record)
      return { student: publicStudent(student, true), appointment, record }
    }
  }
}

module.exports = { createMemoryStore }
