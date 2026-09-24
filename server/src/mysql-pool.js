const mysql = require('mysql2/promise')

function createMysqlPool(env = process.env) {
  const address = (env.MYSQL_ADDRESS || '').trim()
  const username = env.MYSQL_USERNAME
  const password = env.MYSQL_PASSWORD
  const database = env.MYSQL_DATABASE || 'nodejs_demo'
  if (!address || !username || password === undefined) {
    throw new Error('MYSQL_ADDRESS, MYSQL_USERNAME, and MYSQL_PASSWORD must be configured')
  }

  const separator = address.lastIndexOf(':')
  const host = env.MYSQL_HOST || (separator > 0 ? address.slice(0, separator) : address)
  const addressPort = separator > 0 ? address.slice(separator + 1) : ''
  const port = Number(env.MYSQL_PORT || addressPort || 3306)
  const connectionLimit = Number(env.MYSQL_CONNECTION_LIMIT || 5)
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_ADDRESS must use host:port or provide a valid MYSQL_HOST and MYSQL_PORT')
  }
  if (!Number.isSafeInteger(connectionLimit) || connectionLimit < 1) {
    throw new Error('MYSQL_CONNECTION_LIMIT must be a positive integer')
  }

  return {
    pool: mysql.createPool({
      host,
      port,
      user: username,
      password,
      database,
      waitForConnections: true,
      connectionLimit,
      queueLimit: 0,
      dateStrings: true,
      timezone: 'Z'
    }),
    host,
    port,
    database
  }
}

module.exports = { createMysqlPool }
