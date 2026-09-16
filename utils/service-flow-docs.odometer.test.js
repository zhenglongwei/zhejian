const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseOdometerMileageFromTexts,
  isOdometerFinding,
  pickOdometerSlot,
} = require('./service-flow-docs')

test('parses labeled dashboard mileage', () => {
  assert.equal(parseOdometerMileageFromTexts(['ODO 086500 km', '12:45']), '86500')
  assert.equal(parseOdometerMileageFromTexts(['总里程 62300公里']), '62300')
})

test('picks the largest plausible odometer reading', () => {
  assert.equal(parseOdometerMileageFromTexts(['86', '86500', '12']), '86500')
})

test('does not treat 仪表灯 as odometer finding', () => {
  assert.equal(isOdometerFinding({ partName: '仪表灯' }), false)
  assert.equal(isOdometerFinding({ partName: '仪表' }), true)
  assert.equal(isOdometerFinding({ partName: '里程表' }), true)
})

test('lifts legacy 仪表 finding into the mileage slot', () => {
  const slot = pickOdometerSlot(
    {},
    [
      { partName: '仪表', url: 'https://a.jpg', result: '仅记录' },
      { partName: '机油', url: 'https://b.jpg', result: '需处理' },
    ],
  )
  assert.equal(slot.odometerUrl, 'https://a.jpg')
  assert.equal(slot.findings.length, 1)
  assert.equal(slot.findings[0].partName, '机油')
})

test('keeps explicit odometerUrl and strips it from findings', () => {
  const slot = pickOdometerSlot(
    { odometerUrl: 'https://odo.jpg' },
    [
      { partName: '仪表', url: 'https://odo.jpg' },
      { partName: '右前门', url: 'https://door.jpg' },
    ],
  )
  assert.equal(slot.odometerUrl, 'https://odo.jpg')
  assert.equal(slot.findings.length, 1)
  assert.equal(slot.findings[0].partName, '右前门')
})
