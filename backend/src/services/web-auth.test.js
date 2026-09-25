const { test, after } = require('node:test')
const assert = require('node:assert/strict')

const { prisma } = require('../lib/prisma')
const { findOrCreateUserByPhone } = require('./web-auth.service')

const realUser = prisma.user

function stubUser(model) {
  Object.defineProperty(prisma, 'user', {
    value: model,
    writable: true,
    configurable: true,
  })
}

after(() => stubUser(realUser))

test('已绑微信的账号：手机号登录被拒，改走微信扫码', async () => {
  stubUser({
    findMany: async () => [{ id: 'u1', openid: 'o1', phone: '13800000000' }],
  })
  const res = await findOrCreateUserByPhone('13800000000')
  assert.equal(res.ok, false)
  assert.equal(res.code, 'USE_WECHAT_LOGIN')
})

test('没绑微信的 phone-only 账号：手机号登录放行', async () => {
  stubUser({
    findMany: async () => [{ id: 'u2', openid: null, phone: '13800000000' }],
  })
  const res = await findOrCreateUserByPhone('13800000000')
  assert.equal(res.ok, true)
  assert.equal(res.user.id, 'u2')
  assert.equal(res.isNewUser, false)
})

test('同一手机号下微信账号与 phone-only 账号并存时，按微信账号处理（拒手机号登录）', async () => {
  stubUser({
    findMany: async () => [
      { id: 'u3', openid: null, phone: '13800000000' },
      { id: 'u4', openid: 'o4', phone: '13800000000' },
    ],
  })
  const res = await findOrCreateUserByPhone('13800000000')
  assert.equal(res.ok, false)
  assert.equal(res.code, 'USE_WECHAT_LOGIN')
})

test('没有任何账号时新建 phone-only 账号', async () => {
  stubUser({
    findMany: async () => [],
    create: async ({ data }) => ({ id: 'u5', ...data }),
  })
  const res = await findOrCreateUserByPhone('13900000000')
  assert.equal(res.ok, true)
  assert.equal(res.isNewUser, true)
  assert.equal(res.user.phone, '13900000000')
})
