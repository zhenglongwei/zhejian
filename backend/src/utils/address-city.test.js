const assert = require('assert')
const {
  extractCityFromAddress,
  normalizeCityLabel,
  cityLabelFromStore,
} = require('./address-city')

function run() {
  assert.strictEqual(extractCityFromAddress('浙江省杭州市西湖区龙井路1号'), '杭州市')
  assert.strictEqual(extractCityFromAddress('浙江省杭州市西湖区测试路1号'), '杭州市')
  assert.strictEqual(extractCityFromAddress('上海市南京西路1号'), '上海市')
  assert.strictEqual(extractCityFromAddress('北京市朝阳区'), '北京市')
  assert.strictEqual(extractCityFromAddress('内蒙古自治区呼和浩特市新华大街'), '呼和浩特市')
  assert.strictEqual(extractCityFromAddress('广西壮族自治区南宁市'), '南宁市')
  assert.strictEqual(extractCityFromAddress('省杭州市西湖区'), '杭州市')
  assert.strictEqual(extractCityFromAddress(''), '')

  assert.strictEqual(normalizeCityLabel('省杭州市'), '杭州市')
  assert.strictEqual(normalizeCityLabel('杭州'), '杭州')
  assert.strictEqual(
    cityLabelFromStore({ city: '省杭州市', address: '浙江省杭州市西湖区龙井路1号' }),
    '杭州市'
  )
  assert.strictEqual(
    cityLabelFromStore({ address: '浙江省杭州市西湖区龙井路1号' }),
    '杭州市'
  )

  console.log('[address-city.test] ok')
}

run()
