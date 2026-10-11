const test = require('node:test')
const assert = require('node:assert/strict')
const { buildMerchantAlbumOverview } = require('./merchant-album-overview')

function node(partial) {
  return {
    id: partial.kind,
    status: 'completed',
    sortOrder: partial.sortOrder,
    photoCount: 0,
    previewImages: [],
    ...partial,
  }
}

test('施工中的详情用真实车牌和四张单据', () => {
  const view = buildMerchantAlbumOverview(
    {
      vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系', modelYear: '2021', mileage: 68420 },
      userPhone: '13700002021',
      userPhoneDisplay: '137****2021',
      createdAt: '2026-10-11T01:00:00.000Z',
    },
    [
      node({ kind: 'intake', sortOrder: 0, photoCount: 4 }),
      node({ kind: 'inspection', sortOrder: 1, photoDraft: { findings: [{ result: '状态良好' }, { result: '需处理' }] } }),
      node({
        kind: 'inspection_report',
        sortOrder: 2,
        document: { status: 'delivered', payload: { findings: [{ result: '状态良好' }, { result: '需处理' }] } },
      }),
      node({
        kind: 'quote_confirm',
        sortOrder: 3,
        document: { status: 'confirmed', payload: { lines: [{ amount: 2860 }] } },
      }),
      node({
        id: 'work',
        kind: 'work',
        sortOrder: 4,
        status: 'in_progress',
        photoCount: 4,
        photoDraft: { findings: [{ partName: '气门室盖垫' }] },
        previewImages: [{ url: 'https://example.com/a.jpg', caption: '施工前' }],
      }),
      node({ id: 'delivery', kind: 'delivery_photos', sortOrder: 5, status: 'locked' }),
      node({ id: 'repair', kind: 'repair_report', sortOrder: 6, status: 'locked', document: { status: 'draft' } }),
    ],
    new Date('2026-10-11T04:30:00.000Z'),
  )
  assert.equal(view.plate, '粤B·7K52M')
  assert.equal(view.pill.text, '施工中')
  assert.equal(view.vehicleName, '宝马 3系')
  assert.equal(view.spec, '2021款 · 里程 68,420 km')
  assert.match(view.meta, /137 \*\*\*\* 2021/)
  assert.deepEqual(
    view.docs.map((doc) => `${doc.title}:${doc.label}`),
    ['检测报告:已完成', '报价单:已确认', '维修工单:施工中', '交车报告:待生成'],
  )
  assert.equal(view.rows[2].detail, '¥2,860 · 已确认')
  assert.equal(view.rows[3].state, 'current')
  assert.equal(view.rows[3].shots.length, 1)
  assert.equal(view.rows[4].state, 'todo')
  assert.equal(view.action, '补充施工记录')
})
