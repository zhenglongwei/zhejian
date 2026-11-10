const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPublicServiceFlow } = require('./public-service-flow')

const MASK = 'https://cdn.example.com/files/uploads/desensitized/out.jpg'

/** 公网完工章验收（acceptanceItems · 2026-11-10）：原样展示，含建议观察；旧三段兼容 */
test('公网完工章：acceptanceItems 原样展示（含建议观察）', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      { id: 'a', kind: 'intake_inspection', sortOrder: 0, photoDraft: {} },
      {
        id: 'c',
        kind: 'repair_report',
        sortOrder: 1,
        document: {
          status: 'owner_confirmed',
          payload: {
            repairBrief: '更换刹车片',
            deliveryPhotos: [MASK],
            acceptanceItems: [
              { id: 'a1', name: '制动踏板回弹', standard: '踏板回弹正常', method: '实车试踩', result: 'pass' },
              { id: 'a2', name: '修复面色差', standard: '自然光下无明显色差', result: 'observe' },
            ],
          },
        },
      },
    ],
  })
  const finish = flow.chapters.find((ch) => ch.kind === 'finish' || ch.repairBrief)
  assert.ok(finish, '应有完工章')
  assert.equal(finish.acceptanceItems.length, 2)
  assert.equal(finish.acceptanceItems[0].name, '制动踏板回弹')
  assert.equal(finish.acceptanceItems[0].resultLabel, '合格')
  assert.equal(finish.acceptanceItems[1].resultLabel, '建议观察')
})

test('公网完工章：旧 acceptance 不再映射（旧数据由迁移脚本搬）', () => {
  const flow = buildPublicServiceFlow({
    flowNodes: [
      { id: 'a', kind: 'intake_inspection', sortOrder: 0, photoDraft: {} },
      {
        id: 'c',
        kind: 'repair_report',
        sortOrder: 1,
        document: {
          status: 'owner_confirmed',
          payload: {
            deliveryPhotos: [MASK],
            acceptance: { items: [{ project: '刹车片更换', note: '举升复查力矩到位' }] },
          },
        },
      },
    ],
  })
  const finish = flow.chapters.find((ch) => Array.isArray(ch.acceptanceItems))
  assert.ok(finish, '应有完工章')
  assert.deepEqual(finish.acceptanceItems, [])
})
