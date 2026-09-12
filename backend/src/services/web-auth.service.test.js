process.env.DEV_AUTH_ENABLED = 'true'
process.env.SMS_DEBUG_CODE = '888888'

const assert = require('assert')
const { sendLoginCode, loginWithCode, _codeStore } = require('./web-auth.service')

async function testInvalidPhone() {
  const sent = await sendLoginCode('123', '127.0.0.1')
  assert.strictEqual(sent.ok, false)
  assert.strictEqual(sent.code, 'INVALID_PHONE')
  const login = await loginWithCode('123', '000000')
  assert.strictEqual(login.ok, false)
  assert.strictEqual(login.code, 'INVALID_PHONE')
}

async function testExpiredCode() {
  _codeStore.set('13800138000', { code: '123456', expiresAt: Date.now() - 1000, sentAt: Date.now() })
  const login = await loginWithCode('13800138000', '123456')
  assert.strictEqual(login.ok, false)
  assert.strictEqual(login.code, 'CODE_EXPIRED')
  assert.strictEqual(_codeStore.has('13800138000'), false)
}

async function testWrongCode() {
  _codeStore.set('13800138001', { code: '111111', expiresAt: Date.now() + 60000, sentAt: Date.now() })
  const login = await loginWithCode('13800138001', '000000')
  assert.strictEqual(login.ok, false)
  assert.strictEqual(login.code, 'CODE_WRONG')
  assert.strictEqual(_codeStore.has('13800138001'), true)
}

async function testDevSendCodeWithoutSms() {
  const sent = await sendLoginCode('13800138888', '127.0.0.1')
  assert.strictEqual(sent.ok, true)
  assert.ok(String(sent.loginHint || '').includes('888888'))
  assert.strictEqual(_codeStore.get('13800138888').code, '888888')
}

;(async function run() {
  await testInvalidPhone()
  await testExpiredCode()
  await testWrongCode()
  await testDevSendCodeWithoutSms()
  console.log('web-auth.service.test.js OK')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
