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

test('长简述用完整第一句，不在半句截断', () => {
  assert.equal(
    hostPublicTitle(
      { serviceName: '服务留档' },
      '本次维修针对右前门漆面划痕进行处理。经拆检确认受损情况后，已完成右前门局部补漆。',
    ),
    '本次维修针对右前门漆面划痕进行处理',
  )
})

test('第一句过长时用到逗号前', () => {
  assert.equal(
    hostPublicTitle(
      { serviceName: '服务留档' },
      '针对车辆过坎底盘异响问题，经举升检查发现前悬挂系统橡胶衬套严重老化开裂。本次维修已完成更换。',
    ),
    '针对车辆过坎底盘异响问题',
  )
})
