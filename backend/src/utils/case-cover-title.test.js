const assert = require('assert')
const { composeCaseCoverTitle } = require('./case-cover-title')

function testShopVehicleComplaint() {
  const title = composeCaseCoverTitle({
    storeName: '杭州盈简科技有限公司',
    vehicleText: '比亚迪 秦',
    chiefComplaint: '车辆行驶至14444公里，进行机油机滤更换保养。',
    serviceName: '小保养',
    showStore: true,
  })
  assert.strictEqual(
    title,
    '杭州盈简科技有限公司 · 比亚迪 秦 · 车辆行驶至14444公里，进行机油机滤更换保养'
  )
}

function testUnclaimedOmitsShop() {
  const title = composeCaseCoverTitle({
    storeName: '城北汽修',
    vehicleText: '朗逸',
    chiefComplaint: '刹车有异响',
    serviceName: '刹车保养',
    showStore: false,
  })
  assert.strictEqual(title, '朗逸 · 刹车有异响')
  assert.ok(!title.includes('城北汽修'))
}

function testNoComplaintUsesService() {
  const title = composeCaseCoverTitle({
    storeName: '杭州盈简科技有限公司',
    vehicleText: '大众 高尔夫',
    chiefComplaint: '',
    serviceName: '钣喷修复',
    showStore: true,
  })
  assert.strictEqual(title, '杭州盈简科技有限公司 · 大众 高尔夫 · 钣喷修复')
}

function testPlaceholderServiceFallsThrough() {
  const title = composeCaseCoverTitle({
    storeName: '杭州盈简科技有限公司',
    vehicleText: '测试 轿车',
    chiefComplaint: '到店进行相关检查',
    serviceName: '服务留档',
    fallbackTitle: '右前门有一道划痕，想补漆',
    showStore: true,
  })
  assert.strictEqual(title, '杭州盈简科技有限公司 · 测试 轿车 · 右前门有一道划痕，想补漆')
}

function testLongCatalogVehicleKeepsBrandSeries() {
  const title = composeCaseCoverTitle({
    storeName: '杭州盈简科技有限公司',
    vehicleText: '起亚 赛拉图 1.6L 三厢 手动;自动 前轮驱动 YQ7162(2006.08-)',
    chiefComplaint: '定时保养',
    showStore: true,
  })
  assert.strictEqual(title, '杭州盈简科技有限公司 · 起亚 赛拉图 · 定时保养')
}

function testStripsDesensitizeMark() {
  const title = composeCaseCoverTitle({
    vehicleText: '大众朗逸（已脱敏）',
    serviceName: '刹车片更换',
    showStore: false,
  })
  assert.strictEqual(title, '大众朗逸 · 刹车片更换')
  assert.ok(!title.includes('已脱敏'))
}

testShopVehicleComplaint()
testUnclaimedOmitsShop()
testNoComplaintUsesService()
testPlaceholderServiceFallsThrough()
testLongCatalogVehicleKeepsBrandSeries()
testStripsDesensitizeMark()
console.log('case-cover-title.test.js OK')
