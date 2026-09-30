const { readFile } = require('node:fs/promises')

function phoneError(code) {
  const error = new Error(code === 'PHONE_AUTH_INVALID' ? 'Phone authorization is invalid or expired' : 'Phone service is unavailable')
  error.code = code
  return error
}

function createPhoneExchange({ readToken = () => readFile(process.env.WECHAT_TOKEN_PATH || '/.tencentcloudbase/wx/cloudbase_access_token', 'utf8'),
  request = fetch, appId = process.env.WECHAT_APP_ID || 'wx534bc4c99963dfef' } = {}) {
  return async function exchangePhoneCode(code) {
    let token, response, data
    try {
      token = (await readToken()).trim()
      if (!token) throw new Error('Missing token')
      const url = new URL('https://api.weixin.qq.com/wxa/business/getuserphonenumber')
      url.searchParams.set('cloudbase_access_token', token)
      response = await request(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }), signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('WeChat request failed')
      data = await response.json()
    } catch (_) {
      // Never include access tokens, one-use codes or phone numbers in error logs.
      throw phoneError('PHONE_SERVICE_UNAVAILABLE')
    }
    if (data.errcode) {
      throw phoneError([40029, 40163].includes(data.errcode) ? 'PHONE_AUTH_INVALID' : 'PHONE_SERVICE_UNAVAILABLE')
    }
    const info = data.phone_info
    if (!info || !/^\d{8,15}$/.test(info.purePhoneNumber || '') || !/^\d{1,4}$/.test(info.countryCode || '') ||
        !info.watermark || info.watermark.appid !== appId) throw phoneError('PHONE_SERVICE_UNAVAILABLE')
    return { phoneNumber: info.purePhoneNumber, countryCode: info.countryCode }
  }
}

module.exports = { createPhoneExchange, exchangePhoneCode: createPhoneExchange() }
