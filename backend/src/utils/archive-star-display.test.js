const assert = require('assert')
const { formatPublicStargazer, displayNickname } = require('./archive-star-display')

function testStoreStargazer() {
  const row = formatPublicStargazer({
    user: { nickname: '不该出现的真名', avatarUrl: '', phone: '13800138000' },
    store: { id: 'store_1', name: '城北汽修', avatarUrl: 'https://x/logo.png' },
  })
  assert.strictEqual(row.kind, 'store')
  assert.strictEqual(row.displayName, '城北汽修')
  assert.strictEqual(row.href, '/store/store_1.html')
  assert.strictEqual(JSON.stringify(row).includes('13800138000'), false)
  assert.strictEqual(JSON.stringify(row).includes('不该出现'), false)
}

function testPersonNicknameOnly() {
  const row = formatPublicStargazer({
    user: { nickname: '阿强', avatarUrl: 'https://x/a.png', phone: '13900001111' },
  })
  assert.strictEqual(row.kind, 'person')
  assert.strictEqual(row.displayName, '阿强')
  assert.strictEqual(row.href, '')
  assert.strictEqual(JSON.stringify(row).includes('13900001111'), false)
}

function testEmptyNickname() {
  assert.strictEqual(displayNickname(''), '一位车主')
  const row = formatPublicStargazer({ user: { nickname: '' } })
  assert.strictEqual(row.displayName, '一位车主')
}

testStoreStargazer()
testPersonNicknameOnly()
testEmptyNickname()
console.log('archive-star-display.test.js OK')
