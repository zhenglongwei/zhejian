const assert = require('assert')
const { signAliyunRpc, buildSendSmsParams } = require('./sms')

function testSignStable() {
  const params = { AccessKeyId: 'id', Action: 'SendSms', Format: 'JSON' }
  const a = signAliyunRpc(params, 'secret')
  const b = signAliyunRpc(params, 'secret')
  assert.ok(a)
  assert.strictEqual(a, b)
}

function testStsTokenInSignedParams() {
  const params = buildSendSmsParams({
    mobile: '13800138000',
    tpl: 'SMS_332185412',
    sign: '杭州盈简科技',
    templateParam: { code: '123456' },
    creds: {
      accessKeyId: 'STS.xxx',
      accessKeySecret: 'secret',
      securityToken: 'token-value',
    },
    nonce: 'abc',
    timestamp: '2026-01-01T00:00:00Z',
  })
  assert.strictEqual(params.SecurityToken, 'token-value')
  assert.strictEqual(params.SignName, '杭州盈简科技')
  assert.strictEqual(params.TemplateCode, 'SMS_332185412')
  assert.ok(params.Signature)
  const without = buildSendSmsParams({
    mobile: '13800138000',
    tpl: 'SMS_332185412',
    sign: '杭州盈简科技',
    templateParam: { code: '123456' },
    creds: { accessKeyId: 'LTAIxxx', accessKeySecret: 'secret', securityToken: '' },
    nonce: 'abc',
    timestamp: '2026-01-01T00:00:00Z',
  })
  assert.strictEqual(without.SecurityToken, undefined)
}

testSignStable()
testStsTokenInSignedParams()
console.log('sms.js.test.js OK')
