const test = require('node:test')
const assert = require('node:assert/strict')
const { createPhoneExchange } = require('../src/wechat-phone')

const info = { purePhoneNumber: '13400003931', countryCode: '86', watermark: { appid: 'test-app' } }

test('phone exchange sends the one-use code to WeChat and validates the app identity', async () => {
  let calls = 0
  const exchange = createPhoneExchange({ appId: 'test-app', readToken: async () => ' token\n', request: async (url, options) => {
    calls += 1
    assert.equal(url.origin, 'https://api.weixin.qq.com')
    assert.equal(url.pathname, '/wxa/business/getuserphonenumber')
    assert.equal(url.searchParams.get('cloudbase_access_token'), 'token')
    assert.deepEqual(JSON.parse(options.body), { code: 'one-use-code' })
    return { ok: true, json: async () => ({ errcode: 0, phone_info: info }) }
  } })
  assert.deepEqual(await exchange('one-use-code'), { phoneNumber: '13400003931', countryCode: '86' })
  assert.equal(calls, 1)
})

test('phone exchange rejects missing credentials, expired codes and mismatched app identities', async () => {
  const noToken = createPhoneExchange({ readToken: async () => { throw new Error('secret-token') } })
  await assert.rejects(noToken('code'), error => error.code === 'PHONE_SERVICE_UNAVAILABLE' && !error.message.includes('secret-token'))
  for (const result of [
    { errcode: 40029 },
    { errcode: 0, phone_info: { ...info, watermark: { appid: 'other-app' } } },
    { errcode: 0, phone_info: { ...info, purePhoneNumber: 'invalid' } }
  ]) {
    const exchange = createPhoneExchange({ appId: 'test-app', readToken: async () => 'token', request: async () => ({ ok: true, json: async () => result }) })
    await assert.rejects(exchange('code'), error => error.code === (result.errcode === 40029 ? 'PHONE_AUTH_INVALID' : 'PHONE_SERVICE_UNAVAILABLE'))
  }
})
