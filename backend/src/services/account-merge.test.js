const { test, after } = require('node:test')
const assert = require('node:assert/strict')

const { prisma } = require('../lib/prisma')
const { mergePhoneOnlyAccount } = require('./account-merge.service')
const { USER_STATUS } = require('../constants/user')

const realUser = prisma.user
const realTransaction = prisma.$transaction

function stub(name, value) {
  Object.defineProperty(prisma, name, { value, writable: true, configurable: true })
}

/** 假事务：任意表 updateMany 都算迁走 1 条，调用记录下来供断言 */
function fakeTx(staffRows = []) {
  const calls = []
  const model = (name) => ({
    updateMany: async (args) => {
      calls.push({ table: name, op: 'updateMany', args })
      return { count: 1 }
    },
    findMany: async () => (name === 'merchantStaff' ? staffRows : []),
    findUnique: async () => null,
    update: async (args) => {
      calls.push({ table: name, op: 'update', args })
      return { id: 'x', ...args.data }
    },
    delete: async (args) => {
      calls.push({ table: name, op: 'delete', args })
      return {}
    },
  })
  return { calls, tx: new Proxy({}, { get: (_t, name) => model(name) }) }
}

function setupUsers(from, to, handle) {
  stub('user', {
    findUnique: async ({ where }) => {
      if (where.id === from.id) return from
      if (to && where.id === to.id) return to
      return null
    },
    update: async (args) => {
      handle.calls.push({ table: 'user', op: 'update', args })
      return {}
    },
  })
  stub('$transaction', async (fn) => fn(handle.tx))
}

after(() => {
  stub('user', realUser)
  stub('$transaction', realTransaction)
})

test('迁移：相册改挂新账号并同步手机号，旧账号作废且清空手机号/微信身份', async () => {
  const h = fakeTx()
  setupUsers(
    { id: 'old', openid: null, unionid: null, phone: '13800000000', status: USER_STATUS.ACTIVE },
    { id: 'new', openid: 'o_new', unionid: 'u_new', phone: '13900000000', status: USER_STATUS.ACTIVE },
    h,
  )

  const res = await mergePhoneOnlyAccount({ fromUserId: 'old', toUserId: 'new' })
  assert.equal(res.ok, true)

  // 号码被回收后，新号主人不能凭 userPhone 认领到这些相册
  const album = h.calls.find((c) => c.table === 'album')
  assert.deepEqual(album.args.data, { userId: 'new', userPhone: '13900000000' })

  const userUpdate = h.calls.find((c) => c.table === 'user')
  assert.equal(userUpdate.args.data.status, USER_STATUS.MERGED)
  assert.equal(userUpdate.args.data.phone, '', '手机号必须清掉')
  assert.equal(userUpdate.args.data.openid, null, 'openid 不清会挡住目标账号绑同一个微信')
  assert.equal(userUpdate.args.data.unionid, null)
})

test('旧账号已绑微信：拒绝迁移，必须走微信扫码登录', async () => {
  const h = fakeTx()
  setupUsers(
    { id: 'old', openid: 'o_old', phone: '13800000000', status: USER_STATUS.ACTIVE },
    { id: 'new', openid: null, phone: '13900000000', status: USER_STATUS.ACTIVE },
    h,
  )
  await assert.rejects(
    () => mergePhoneOnlyAccount({ fromUserId: 'old', toUserId: 'new' }),
    (e) => e.status === 409,
  )
})

test('旧账号已作废：报 404，不重复迁', async () => {
  const h = fakeTx()
  setupUsers(
    { id: 'old', openid: null, phone: '13800000000', status: USER_STATUS.MERGED },
    { id: 'new', openid: null, phone: '13900000000', status: USER_STATUS.ACTIVE },
    h,
  )
  await assert.rejects(
    () => mergePhoneOnlyAccount({ fromUserId: 'old', toUserId: 'new' }),
    (e) => e.status === 404,
  )
})

test('缺账号或迁到自己：报 400', async () => {
  const h = fakeTx()
  setupUsers({ id: 'old', openid: null, status: USER_STATUS.ACTIVE }, null, h)
  await assert.rejects(() => mergePhoneOnlyAccount({ toUserId: 'old' }), (e) => e.status === 400)
  await assert.rejects(
    () => mergePhoneOnlyAccount({ fromUserId: 'old', toUserId: 'old' }),
    (e) => e.status === 400,
  )
})

test('员工身份：迁到新账号，邀请手机号用旧号的一并改成新号', async () => {
  const h = fakeTx([{ id: 's1', merchantId: 'm1', invitePhone: '13800000000' }])
  setupUsers(
    { id: 'old', openid: null, phone: '13800000000', status: USER_STATUS.ACTIVE },
    { id: 'new', openid: null, phone: '13900000000', status: USER_STATUS.ACTIVE },
    h,
  )

  const res = await mergePhoneOnlyAccount({ fromUserId: 'old', toUserId: 'new' })
  assert.equal(res.moved.merchantStaff, 1)

  const staffUpdate = h.calls.find((c) => c.table === 'merchantStaff' && c.op === 'update')
  assert.equal(staffUpdate.args.data.userId, 'new')
  assert.equal(staffUpdate.args.data.invitePhone, '13900000000')
})

test('员工身份：目标账号已是同企业员工时删掉旧那条，不留孤儿指向作废账号', async () => {
  const h = fakeTx([{ id: 's1', merchantId: 'm1', invitePhone: '13900000000' }])
  // findUnique 命中重复 → 走删除分支
  const model = () => ({ id: 'dup' })
  h.tx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === 'merchantStaff') {
          return {
            findMany: async () => [{ id: 's1', merchantId: 'm1', invitePhone: '13900000000' }],
            findUnique: async () => model(),
            update: async () => { throw new Error('不该走 update') },
            delete: async (args) => { h.calls.push({ table: 'merchantStaff', op: 'delete', args }); return {} },
            updateMany: async () => ({ count: 0 }),
          }
        }
        return {
          updateMany: async () => ({ count: 1 }),
          findMany: async () => [],
          findUnique: async () => null,
          update: async (args) => ({ ...args.data }),
          delete: async () => ({}),
        }
      },
    },
  )
  setupUsers(
    { id: 'old', openid: null, phone: '13800000000', status: USER_STATUS.ACTIVE },
    { id: 'new', openid: null, phone: '13900000000', status: USER_STATUS.ACTIVE },
    h,
  )

  const res = await mergePhoneOnlyAccount({ fromUserId: 'old', toUserId: 'new' })
  assert.equal(res.moved.merchantStaff, 0, '重复的那条不算迁')
  assert.ok(h.calls.some((c) => c.table === 'merchantStaff' && c.op === 'delete'))
})
