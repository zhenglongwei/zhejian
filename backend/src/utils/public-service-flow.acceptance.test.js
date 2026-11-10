const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPublicServiceFlow } = require('./public-service-flow')

const MASK = 'https://cdn.example.com/files/uploads/desensitized/out.jpg'

/** 公网完工章验收（acceptanceItems · 2026-11-10 二次收敛）：一张清单，外观末行，只有图片/结果/描述 */
test('公网完工章：acceptanceItems 一张清单，外观末行（含建议观察）', () => {
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
            acceptanceItems: [
              { id: 'a1', kind: 'work', name: '制动踏板回弹', note: '实车试踩回弹正常', result: 'pass' },
              { id: 'a2', kind: 'work', name: '修复面色差', note: '自然光下仍有轻微色差', result: 'observe' },
              {
                id: 'exterior',
                kind: 'exterior',
                name: '外观',
                note: '整车外观干净',
                result: 'pass',
                images: [{ url: MASK }],
              },
            ],
          },
        },
      },
    ],
  })
  const finish = flow.chapters.find((ch) => ch.kind === 'finish' || ch.repairBrief)
  assert.ok(finish, '应有完工章')
  assert.equal(finish.acceptanceItems.length, 3)
  assert.equal(finish.acceptanceItems[0].name, '制动踏板回弹')
  assert.equal(finish.acceptanceItems[0].resultLabel, '合格')
  assert.equal(finish.acceptanceItems[1].resultLabel, '建议观察')
  // 外观固定末行，验收图挂在这一行
  assert.equal(finish.acceptanceItems[2].name, '外观')
  assert.equal(finish.acceptanceItems[2].kind, 'exterior')
  assert.equal(finish.acceptanceItems[2].images.length, 1)
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
            repairBrief: '更换刹车片',
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
