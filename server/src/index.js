const express = require('express')

const app = express()
const port = Number(process.env.PORT || 80)

app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'rabbit-api' })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`rabbit-api listening on 0.0.0.0:${port}`)
})
