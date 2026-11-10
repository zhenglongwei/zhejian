const test = require('node:test')
const assert = require('node:assert/strict')
const { migratePackage, normalizeAcceptanceRows, mergeNote } = require('./migrate-delivery-acceptance')

test('标准 / 怎么验并进描述，去重且不丢信息', () => {
  assert.equal(mergeNote({ note: '胶套安装到位', standard: '胶套安装到位', method: '举升目视' }), '胶套安装到位；怎么验：举升目视')
  assert.equal(mergeNote({ note: '', standard: '踏板回弹正常', method: '' }), '踏板回弹正常')
  assert.equal(mergeNote({ note: '无异响', standard: '低速过减速带无异响', method: '' }), '无异响；低速过减速带无异响')
})

test('旧三段验收行迁成一行：只留图片 / 结果 / 描述', () => {
  const rows = normalizeAcceptanceRows([
    {
      project: '左下摆臂胶套更换',
      standard: '胶套安装到位，无渗油',
      method: '举升目视',
      result: 'pass',
      images: ['https://x/1.jpg'],
    },
  ])
  assert.equal(rows.length, 1)
  assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'images', 'kind', 'name', 'note', 'result'])
  assert.equal(rows[0].name, '左下摆臂胶套更换')
  assert.equal(rows[0].kind, 'work')
  assert.equal(rows[0].note, '胶套安装到位，无渗油；怎么验：举升目视')
  assert.equal(rows[0].images.length, 1)
})

test('交车节点：旧外观照搬成「外观」末行，旧字段清掉', () => {
  const pkg = {
    flowNodes: [
      {
        id: 'd',
        kind: 'delivery_photos',
        content: {
          acceptance: { items: [{ project: '机油机滤', standard: '加注到上限', result: 'pass' }] },
          deliveryExteriorUrl: 'https://x/out.jpg',
          selectedDeliveryUrls: ['https://x/side.jpg', 'https://x/out.jpg'],
        },
      },
    ],
  }
  const { pkg: next, changed, stats } = migratePackage(pkg)
  assert.equal(changed, true)
  const content = next.flowNodes[0].content
  assert.equal(content.acceptanceItems.length, 2)
  assert.equal(content.acceptanceItems[0].name, '机油机滤')
  assert.equal(content.acceptanceItems[1].kind, 'exterior')
  assert.equal(content.acceptanceItems[1].name, '外观')
  assert.deepEqual(
    content.acceptanceItems[1].images.map((row) => row.url),
    ['https://x/out.jpg', 'https://x/side.jpg'],
  )
  assert.equal(content.deliveryExteriorUrl, undefined)
  assert.equal(content.selectedDeliveryUrls, undefined)
  assert.equal(content.deliveryPhotos, undefined)
  assert.equal(content.acceptance, undefined)
  assert.equal(stats.exteriorRows, 1)
})

test('完工报告 payload：旧 deliveryPhotos 也搬进外观行', () => {
  const pkg = {
    flowNodes: [
      {
        id: 'r',
        kind: 'repair_report',
        document: {
          payload: {
            acceptanceItems: [{ id: 'a1', kind: 'work', name: '路试', note: '无异响', result: 'pass' }],
            deliveryPhotos: [{ url: 'https://x/out.jpg' }],
          },
        },
      },
    ],
  }
  const { pkg: next } = migratePackage(pkg)
  const payload = next.flowNodes[0].document.payload
  assert.equal(payload.deliveryPhotos, undefined)
  assert.equal(payload.acceptanceItems.length, 2)
  assert.equal(payload.acceptanceItems[1].kind, 'exterior')
  assert.equal(payload.acceptanceItems[1].images[0].url, 'https://x/out.jpg')
})

test('有施工项目时按项目重建：旧「整体验收」行让位', () => {
  const pkg = {
    flowNodes: [
      {
        id: 'w',
        kind: 'work',
        photoDraft: { findings: [{ partName: '侧裙修复' }, { partName: '护板螺丝复紧' }] },
      },
      {
        id: 'd',
        kind: 'delivery_photos',
        content: {
          acceptanceItems: [
            {
              id: 'acc_1',
              kind: 'work',
              name: '整体验收',
              images: [{ url: 'https://x/old.jpg' }],
              result: 'pass',
              note: '举升检查护板螺丝力矩，护板固定牢靠',
            },
            {
              id: 'exterior',
              kind: 'exterior',
              name: '外观',
              images: [{ url: 'https://x/out.jpg' }],
              result: 'pass',
              note: '',
            },
          ],
        },
      },
    ],
  }
  const { pkg: next, stats } = migratePackage(pkg)
  const content = next.flowNodes[1].content
  assert.deepEqual(
    content.acceptanceItems.map((row) => row.name),
    ['侧裙修复', '护板螺丝复紧', '外观'],
  )
  assert.equal(content.acceptanceItems[0].result, '')
  assert.equal(content.acceptanceItems[2].images[0].url, 'https://x/out.jpg')
  assert.equal(stats.droppedRows, 1)
})

test('迁移幂等：再跑一次不再改', () => {
  const pkg = {
    flowNodes: [
      {
        id: 'd',
        kind: 'delivery_photos',
        content: {
          acceptanceItems: [
            { id: 'a1', kind: 'work', name: '机油机滤', images: [], result: 'pass', note: '加注到上限' },
            {
              id: 'exterior',
              kind: 'exterior',
              name: '外观',
              images: [{ url: 'https://x/out.jpg', imageId: '' }],
              result: 'pass',
              note: '',
            },
          ],
        },
      },
    ],
  }
  const first = migratePackage(JSON.parse(JSON.stringify(pkg)))
  assert.equal(first.changed, false)
})

test('archiveCopy 迁进交车节点后删除', () => {
  const pkg = {
    archiveCopy: { summary: '更换下摆臂胶套', faq: [{ q: '多久复查？', a: '500 公里后' }] },
    flowNodes: [{ id: 'd', kind: 'delivery_photos', content: {} }],
  }
  const { pkg: next, stats } = migratePackage(pkg)
  const content = next.flowNodes[0].content
  assert.equal(content.repairBrief, '更换下摆臂胶套')
  assert.equal(content.ownerFaqs.length, 1)
  assert.equal(next.archiveCopy, undefined)
  assert.equal(stats.archiveCopy, 1)
})
