const test = require('node:test')
const { createMemoryStore } = require('../src/memory-store')
const { businessContract } = require('./business-contract')
businessContract(test, 'API', async () => createMemoryStore())
