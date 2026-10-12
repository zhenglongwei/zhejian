const test = require('node:test')
const assert = require('node:assert/strict')
const { scoreBasicProfile, polishIntro, photoAdvice, certSummary } = require('./merchant-basic-profile')

test('基础资料满分不含执照和技师', () => {
  const scored = scoreBasicProfile({
    storeName: '驰援汽车服务中心',
    address: '深圳市南山区科苑路 18 号',
    storePhone: '0755-86528866',
    businessHours: '周一至周日 08:30-19:00',
    intro: '专注德系车辆维修保养十二年，店里坚持透明报价、过程留证，旧件可以拿到店给车主看。',
    facadePhotoUrl: 'https://example.com/facade.jpg',
    workshopPhotoUrls: ['https://example.com/bay.jpg'],
    receptionPhotoUrls: ['https://example.com/wait.jpg'],
    technicians: [],
    licensePhotoUrl: '',
  })
  assert.equal(scored.score, 100)
  assert.equal(scored.complete, true)
  assert.equal(scored.missingLine, '')
})

test('占位店名、短介绍和缺图都扣分', () => {
  const scored = scoreBasicProfile({
    storeName: '我的门店',
    address: '深圳市南山区',
    phone: '',
    businessHours: '09:00-18:00',
    intro: '修车',
    photos: {},
  })
  assert.equal(scored.score, 15 + 10 + 12)
  assert.match(scored.missingLine, /门店名称/)
  assert.match(scored.missingLine, /联系电话/)
  assert.equal(scored.items.find((item) => item.key === 'intro').points, 12)
  assert.equal(scored.gaps.find((item) => item.key === 'intro').note, '门店介绍写短了')
  assert.equal(scored.label, '')
})

test('润色收成一段，不补地名和擅长项目', () => {
  const now = new Date('2026-10-12T00:00:00+08:00')
  const empty = polishIntro({ intro: '' }, now)
  assert.equal(empty.draft, '')
  assert.match(empty.hints[0], /先写一段介绍/)

  const polished = polishIntro({
    storeName: '驰援汽车服务中心',
    intro: '专注德系车辆维修保养。坚持透明报价、过程留证、旧件展示',
    address: '深圳市南山区科苑路 18 号',
    services: ['发动机维修'],
    licenseEstablishedOn: '2013-06-01',
    technicians: [{ name: '陈海峰' }, { name: '李志强' }],
  }, now)
  assert.match(polished.draft, /成立于 2013 年/)
  assert.match(polished.draft, /专注德系车辆维修保养 13 年/)
  assert.match(polished.draft, /2 位技师/)
  assert.match(polished.draft, /透明报价/)
  assert.doesNotMatch(polished.draft, /南山|发动机维修|宝马/)
})

test('收录建议只说缺图和尺寸', () => {
  const missing = photoAdvice({ facadePhotoUrl: '', workshopPhotoUrls: [], receptionPhotoUrls: [] })
  assert.match(missing.lines.join(''), /门头/)
  assert.match(missing.lines.join(''), /工位/)

  const small = photoAdvice(
    {
      facadePhotoUrl: 'https://example.com/a.jpg',
      workshopPhotoUrls: ['https://example.com/b.jpg'],
      receptionPhotoUrls: ['https://example.com/c.jpg'],
    },
    { 'https://example.com/a.jpg': { width: 400, height: 300 } },
  )
  assert.match(small.lines[0], /门头偏小/)
})

test('资质行同时认执照和技师', () => {
  assert.equal(certSummary({ technicians: [{ name: '陈海峰' }] }).value, '1 位技师')
  assert.equal(
    certSummary({ licensePhotoUrl: 'https://example.com/lic.jpg', technicians: [] }).value,
    '执照已传',
  )
  assert.equal(certSummary({}).done, false)
})
