const test = require('node:test')
const assert = require('node:assert/strict')
const { buildStoreHomeModel, countPublicAlbums, monthViewTotal } = require('./merchant-store-home')

test('缺项按真实资料算百分比，不写推荐概率', () => {
  const model = buildStoreHomeModel({
    storeName: '驰援汽车服务中心',
    address: '深圳市南山区',
    intro: '',
    services: [],
    technicians: [],
    businessHours: '09:00-18:00',
    photos: {},
    publisherTrust: { authStatus: 'verified', authStatusLabel: '已认证' },
  })
  assert.equal(model.logoText, '驰援')
  assert.equal(model.verified, true)
  assert.equal(model.percent, 33)
  assert.equal(model.missingCount, 4)
  assert.match(model.missingLine, /门店介绍/)
  assert.equal(model.introValue, '待补充')
})

test('资料齐了不再提示补充', () => {
  const model = buildStoreHomeModel({
    storeName: '驰援',
    address: '南山区',
    intro: '专注德系车辆维修保养',
    services: ['发动机维修'],
    technicians: [{ name: '王师傅' }],
    businessHours: '09:00-18:00',
    photos: { facadeUrl: 'https://example.com/a.jpg' },
  })
  assert.equal(model.complete, true)
  assert.equal(model.percent, 100)
  assert.equal(model.missingLine, '')
  assert.equal(model.techValue, '1 位技师')
})

test('公开案例认已上网的相册，浏览量只加门店和案例', () => {
  assert.equal(
    countPublicAlbums([
      { hostedSiteUrl: 'https://geo.example/store/1' },
      { hubCard: { publicOnSite: true } },
      { hostedSiteUrl: '' },
    ]),
    2,
  )
  assert.equal(monthViewTotal({ storeViewCount: 20, caseViewCount: 6, phoneClickCount: 9 }), 26)
})
