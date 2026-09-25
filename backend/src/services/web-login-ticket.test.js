const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  confirmTicket,
  consumeTicket,
  _ticketStore,
} = require('./web-login-ticket.service')

function put(ticket, patch) {
  _ticketStore.set(ticket, {
    action: 'login',
    webUserId: '',
    status: 'pending',
    expiresAt: Date.now() + 60000,
    resultUserId: '',
    ...patch,
  })
}

test('票据不存在时轮询返回过期', async () => {
  const res = await consumeTicket('not-exist')
  assert.equal(res.status, 'expired')
})

test('没确认时轮询一直是 pending（不被误判成过期）', async () => {
  put('t-pending', {})
  const res = await consumeTicket('t-pending')
  assert.equal(res.status, 'pending')
  _ticketStore.delete('t-pending')
})

test('过期票据不能确认', async () => {
  put('t-expired', { expiresAt: Date.now() - 1000 })
  await assert.rejects(() => confirmTicket('t-expired', 'u1'), /过期/)
  assert.equal(_ticketStore.has('t-expired'), false)
})

test('确认成功一次后，重复确认被拒', async () => {
  put('t-ok', {})
  const first = await confirmTicket('t-ok', 'u1')
  assert.equal(first.ok, true)
  assert.equal(first.action, 'login')
  await assert.rejects(() => confirmTicket('t-ok', 'u1'), /已经确认/)
  _ticketStore.delete('t-ok')
})

test('过期票据轮询返回过期并清掉', async () => {
  put('t-old', { expiresAt: Date.now() - 1000 })
  const res = await consumeTicket('t-old')
  assert.equal(res.status, 'expired')
  assert.equal(_ticketStore.has('t-old'), false)
})
