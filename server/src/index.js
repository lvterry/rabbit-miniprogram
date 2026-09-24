const { createApp } = require('./app')

const app = createApp({ teacherOpenid: process.env.TEACHER_OPENID })
const port = Number(process.env.PORT || 80)

app.listen(port, '0.0.0.0', () => {
  console.log(`rabbit-api listening on 0.0.0.0:${port}; teacher account ${process.env.TEACHER_OPENID ? 'configured' : 'not configured'}`)
})
