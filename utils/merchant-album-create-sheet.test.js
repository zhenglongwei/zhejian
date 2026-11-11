const test = require('node:test')
const assert = require('node:assert/strict')
const { validateCreateSheet, parseMileage, isValidVin } = require('./merchant-album-create-sheet')

test('mileage keeps the digits', () => {
  assert.equal(parseMileage('32,000'), 32000)
  assert.equal(parseMileage(''), null)
})

test('sheet requires plate, mileage, brand and series', () => {
  assert.equal(validateCreateSheet({}).ok, false)
  const result = validateCreateSheet({
    plate: '浙a12345',
    mileage: '18600',
    vin: 'LSVAA4185E2123456',
    vehicleBrand: '大众',
    vehicleSeries: '途观',
    vehicleYear: '2020',
    userPhone: '13800138000',
  })
  assert.equal(result.ok, true)
  assert.equal(result.plate, '浙A12345')
  assert.equal(result.mileage, 18600)
  assert.equal(result.vin, 'LSVAA4185E2123456')
})

test('short vin and short phone are rejected', () => {
  const base = {
    plate: '浙A12345',
    mileage: '1',
    vehicleBrand: '大众',
    vehicleSeries: '途观',
  }
  assert.equal(validateCreateSheet({ ...base, vin: 'ABC' }).message, '车架号须为 17 位')
  assert.equal(validateCreateSheet({ ...base, userPhone: '138' }).message, '请填写正确的手机号')
})

test('vin is validated against encoding rules before decoding', () => {
  assert.equal(isValidVin('LSVAM4187E2134567'), true)
  assert.equal(isValidVin(' lsvam4187e2134567 '), true)
  // 含 I/O/Q
  assert.equal(isValidVin('LSVAM418O E2134567'), false)
  // 位数不足
  assert.equal(isValidVin('LSVAM4187E213456'), false)
  // 第 10 位年份代码为 U
  assert.equal(isValidVin('LSVAM4187U2134567'), false)
})
