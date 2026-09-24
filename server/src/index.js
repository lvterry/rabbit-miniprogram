const { createApp } = require('./app')
const { createMysqlPool } = require('./mysql-pool')
const { createMysqlStore } = require('./mysql-store')
const port = Number(process.env.PORT || 80)

async function start() {
  let pool
  let store
  let server
  try {
    const database = createMysqlPool()
    pool = database.pool
    store = createMysqlStore(pool)
    await store.initialize()

    server = createApp({ store }).listen(port, '0.0.0.0')
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    console.log(`rabbit-api listening on 0.0.0.0:${port}; MySQL ${database.host}:${database.port}/${database.database}`)
  } catch (error) {
    console.error('rabbit-api failed to start:', error.code || error.message)
    if (store) await store.close().catch(closeError => console.error('MySQL pool close failed:', closeError.message))
    else if (pool) await pool.end().catch(closeError => console.error('MySQL pool close failed:', closeError.message))
    process.exitCode = 1
    return
  }

  let shuttingDown = false
  const shutdown = signal => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`rabbit-api received ${signal}; shutting down`)
    server.close(async error => {
      if (error) {
        console.error('HTTP server close failed:', error.message)
        process.exitCode = 1
      }
      try {
        await store.close()
      } catch (closeError) {
        console.error('MySQL pool close failed:', closeError.message)
        process.exitCode = 1
      }
    })
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
}

start()
