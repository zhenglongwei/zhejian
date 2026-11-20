const test = require('node:test')
const assert = require('node:assert/strict')
const { vehicleAnchor, vehiclePromptRow } = require('./vehicle-anchor')

test('车型锚点以相册登记为准，单据字段只补空', () => {
  const got = vehicleAnchor(
    { brand: '宝马', series: '3系', modelYear: '2021', gearbox: '8AT', mileage: 68420 },
    { brand: '大众', series: '高尔夫', mileageText: '里程 62000 km' },
  )
  assert.equal(got.brand, '宝马')
  assert.equal(got.series, '3系')
  assert.equal(got.year, '2021')
  assert.equal(got.gearbox, '8AT')
  assert.equal(got.mileage, '68420km')
})

test('车型锚点不带车牌、VIN、车架号', () => {
  const got = vehicleAnchor({
    brand: '大众',
    series: '高尔夫',
    plate: '粤B7K52M',
    vin: 'WBA8E91050J979246',
    chassisCode: 'LVGBE49K7HG',
  })
  const sent = JSON.stringify(got)
  assert.equal(sent.includes('粤B7K52M'), false)
  assert.equal(sent.includes('WBA8E91050'), false)
  assert.equal(sent.includes('LVGBE49K7HG'), false)
})

test('认不出品牌与车系时返回 null，空字段不占位', () => {
  assert.equal(vehicleAnchor({ plate: '粤B7K52M' }), null)
  assert.equal(vehicleAnchor(null), null)
  assert.equal(vehicleAnchor({ series: '高尔夫', displacement: '' }).displacement, undefined)
  assert.equal(vehiclePromptRow(null), null)
})

test('提示词里的车辆一行键序固定，缺项留空', () => {
  const row = vehiclePromptRow(vehicleAnchor({ brand: '宝马', modelYear: '2021' }))
  assert.equal(
    JSON.stringify(row),
    '{"品牌":"宝马","车系":"","年款":"2021","完整车型":"","排量":"","发动机":"","变速箱":"","里程":""}',
  )
})

test('兼容原始字段名：engine/transmission/model_year/odometer', () => {
  const got = vehicleAnchor({
    brand: '大众',
    engine: 'EA888',
    transmission: 'DSG',
    model_year: '2019',
    odometer: '62000 km',
  })
  assert.equal(got.engine, 'EA888')
  assert.equal(got.gearbox, 'DSG')
  assert.equal(got.year, '2019')
  assert.equal(got.mileage, '62000km')
})
