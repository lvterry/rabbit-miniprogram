const { createApp } = require('./app')

const app = createApp()
const port = Number(process.env.PORT || 80)

app.listen(port, '0.0.0.0', () => {
  console.log(`rabbit-api listening on 0.0.0.0:${port}`)
})
