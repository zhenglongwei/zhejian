const test = require('node:test')
const assert = require('node:assert/strict')
const {
  defaultMerchantAlbumFilters,
  normalizeMerchantAlbumFilters,
  matchesMerchantAlbumFilters,
  matchesMerchantAlbumKeyword,
  buildMerchantAlbumFilterGroups,
  summarizeMerchantAlbumFilters,
  merchantAlbumFiltersFromQuery,
} = require('./merchant-album-filters')
const { presentAlbumCard } = require('./merchant-workbench-home')

function card(over = {}) {
  return {
    repairDone: false,
    publicOnSite: false,
    reviewStatus: 'not_reviewed',
    ...over,
  }
}

const CARDS = [
  card(),
  card({ repairDone: true, publicOnSite: true, reviewStatus: 'reviewed' }),
  card({ repairDone: true, publicOnSite: true, reviewStatus: 'not_reviewed' }),
  card({ repairDone: true, publicOnSite: false, reviewStatus: 'replied' }),
]

test('默认三维全打开，任何相册都命中', () => {
  const filters = defaultMerchantAlbumFilters()
  assert.deepEqual(filters, { progress: 'all', public: 'all', review: 'all' })
  assert.equal(matchesMerchantAlbumFilters(card(), filters), true)
})

test('进行中与已公开互斥时不再显示已交车相册', () => {
  assert.equal(matchesMerchantAlbumFilters(card(), { progress: 'active', public: 'on' }), false)
  assert.equal(
    matchesMerchantAlbumFilters(card({ repairDone: true, publicOnSite: true }), {
      progress: 'done',
      public: 'on',
    }),
    true,
  )
})

test('待评价与已评价都只挂在已交车相册上', () => {
  const unfinished = card({ publicOnSite: false })
  assert.equal(matchesMerchantAlbumFilters(unfinished, { review: 'pending' }), false)
  assert.equal(matchesMerchantAlbumFilters(unfinished, { review: 'reviewed' }), false)
  assert.equal(
    matchesMerchantAlbumFilters(card({ repairDone: true }), { review: 'pending' }),
    true,
  )
  assert.equal(
    matchesMerchantAlbumFilters(card({ repairDone: true, reviewStatus: 'replied' }), {
      review: 'reviewed',
    }),
    true,
  )
})

test('分面计数跟着其余维收窄，不会让人点进空列表', () => {
  const groups = buildMerchantAlbumFilterGroups(CARDS, { progress: 'active' })
  const progress = groups.find((group) => group.key === 'progress')
  const pub = groups.find((group) => group.key === 'public')
  assert.equal(progress.options.find((o) => o.key === 'all').count, 4)
  assert.equal(progress.options.find((o) => o.key === 'active').count, 1)
  assert.equal(progress.options.find((o) => o.key === 'done').count, 3)
  // 已选「进行中」后，公开状态各档只在那 1 本未完工相册里算
  assert.equal(pub.options.find((o) => o.key === 'all').count, 1)
  assert.equal(pub.options.find((o) => o.key === 'on').count, 0)
  assert.equal(pub.options.find((o) => o.key === 'off').count, 1)
})

test('摘要只列出非默认的档位', () => {
  assert.deepEqual(summarizeMerchantAlbumFilters(defaultMerchantAlbumFilters()), [])
  assert.deepEqual(
    summarizeMerchantAlbumFilters({ progress: 'done', public: 'on' }).map((tag) => tag.label),
    ['已完成', '已公开'],
  )
})

test('旧 tab 深链落进进度维，非法值退回全部', () => {
  assert.deepEqual(merchantAlbumFiltersFromQuery({ tab: 'done' }), {
    progress: 'done',
    public: 'all',
    review: 'all',
  })
  assert.equal(merchantAlbumFiltersFromQuery({ tab: 'confirm' }).progress, 'all')
  assert.equal(normalizeMerchantAlbumFilters({ progress: 'nope' }).progress, 'all')
  assert.equal(merchantAlbumFiltersFromQuery({ public: 'on' }).public, 'on')
})

test('关键词忽略大小写，空格要求同时命中', () => {
  const bmw = card({ searchText: 'alb_1 宝马 3系 粤b7k52m 13800001111' })
  const benz = card({ searchText: 'alb_2 奔驰 glc 浙a12345 13900002222' })
  assert.equal(matchesMerchantAlbumKeyword(bmw, ''), true)
  assert.equal(matchesMerchantAlbumKeyword(bmw, '   '), true)
  assert.equal(matchesMerchantAlbumKeyword(bmw, '粤B7K'), true)
  assert.equal(matchesMerchantAlbumKeyword(bmw, '138 9999'), false)
  assert.equal(matchesMerchantAlbumKeyword(bmw, '宝马 粤b7'), true)
  assert.equal(matchesMerchantAlbumKeyword(bmw, '宝马 奔驰'), false)
  assert.equal(matchesMerchantAlbumKeyword(benz, '粤B'), false)
})

test('端上能搜到的字段覆盖服务端那份并集', () => {
  const presented = presentAlbumCard({
    albumId: 'alb_9',
    serviceName: '精洗内外饰',
    storeName: '辙见汽车服务',
    userPhone: '13800001111',
    userPhoneDisplay: '138****1111',
    vehicle: {
      brand: '宝马',
      series: '3系',
      plate: '粤B7K52M',
      plateDisplay: '粤B****M',
      vin: 'LBV4R3105M',
      modelYear: '2021款',
      modelName: '325Li',
    },
    hubCard: { plate: '粤B7K52M', modelLine: '宝马 · 3系 · 2021款' },
  })
  for (const q of ['粤B7K52M', '粤B****M', '325Li', 'LBV4R3105M', '13800001111', '精洗', '宝马 3系']) {
    assert.equal(matchesMerchantAlbumKeyword(presented, q), true, q)
  }
  assert.equal(matchesMerchantAlbumKeyword(presented, '奥迪'), false)
})
