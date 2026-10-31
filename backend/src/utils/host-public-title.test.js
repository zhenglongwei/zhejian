const test = require('node:test')
const assert = require('node:assert/strict')
const { hostPublicTitle } = require('./host-public-title')

test('已填服务名原样作为公开标题', () => {
  assert.equal(hostPublicTitle({ serviceName: '小保养' }, '更换机油'), '小保养')
})

test('默认名服务留档时用交车简述', () => {
  assert.equal(
    hostPublicTitle({ serviceName: '服务留档' }, '更换机油滤芯，并做了拆检。'),
    '更换机油滤芯，并做了拆检',
  )
})

test('没有简述时退回维修案例', () => {
  assert.equal(hostPublicTitle({ serviceName: '服务留档' }, ''), '维修案例')
})
