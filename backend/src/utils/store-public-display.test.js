/**
 * 门店公开展示门闩单测
 */
const assert = require('assert')
const {
  filterPublicSpecialties,
  filterPublicEnvironmentImages,
} = require('./store-public-display')

function run() {
  assert.deepStrictEqual(filterPublicSpecialties(['钣喷修复', '疑难杂症', '']), ['钣喷修复'])
  assert.deepStrictEqual(filterPublicSpecialties(['各类维修', '刹车系统']), ['刹车系统'])
  assert.deepStrictEqual(
    filterPublicEnvironmentImages([
      '',
      'about:blank',
      '/media/workshop-1.jpg',
      'https://cdn.example.com/placeholder.png',
      '/media/workshop-1.jpg',
    ]),
    ['/media/workshop-1.jpg']
  )
  console.log('[store-public-display.test] ok')
}

run()
