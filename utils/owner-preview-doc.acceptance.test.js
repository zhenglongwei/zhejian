const test = require('node:test')
const assert = require('node:assert/strict')
const { buildOwnerPreviewDoc } = require('./owner-preview-doc')

/** 交车报告（2026-11-17）：只做交车凭证，展示整车照、交车信息与相关报告入口 */
test('交车报告：整车照 + 交车信息 + 报告入口，不再合并施工验收清单', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    album: { templateId: 'brake', serviceName: '刹车维修', storeName: '辙见店' },
    workItems: [
      {
        name: '制动踏板回弹',
        note: '更换制动总泵后排气，踏板回弹正常。',
        images: [{ url: 'https://cdn.example.com/work.jpg' }],
      },
    ],
    acceptanceItems: [
      { id: 'a1', kind: 'work', name: '制动踏板回弹', note: '实车试踩回弹正常', result: 'pass' },
      {
        id: 'exterior',
        kind: 'exterior',
        name: '外观',
        images: [{ url: 'https://cdn.example.com/car.jpg' }],
      },
    ],
    workDurationMinutes: 90,
    warrantyPeriod: '3 个月',
    warrantyNotes: '避免急刹',
    signName: '张师傅',
    signAt: '11月17日 09:42',
    reportLinks: [{ nodeId: 'n1', kind: 'work', title: '维修工单' }],
  })
  const doc = preview.doc
  assert.deepEqual(doc.exteriorImages.map((row) => row.url), ['https://cdn.example.com/car.jpg'])
  assert.equal(doc.exteriorMissing, false)
  assert.equal(doc.workDurationText, '约 1.5 小时')
  assert.equal(doc.warrantyPeriod, '3 个月')
  assert.equal(doc.warrantyNotes, '避免急刹')
  assert.equal(doc.signLabel, '交付人')
  assert.equal(doc.signName, '张师傅')
  assert.equal(doc.signAtLabel, '交车时间')
  assert.deepEqual(doc.reportLinks, [{ nodeId: 'n1', kind: 'work', title: '维修工单' }])
  // 交车凭证不再渲染清单 / 合计 / 返工
  assert.equal(doc.rows, undefined)
  assert.equal(doc.totalAmountLabel, undefined)
  assert.equal(doc.reworkRecords, undefined)
  // 兼容字段保留，供公开完工章与商家回填
  assert.equal(doc.workItems.length, 1)
  assert.equal(doc.acceptanceItems.length, 2)
})

test('交车报告：有外观行但没图时如实标注', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    acceptanceItems: [{ id: 'exterior', kind: 'exterior', name: '外观', images: [] }],
  })
  assert.equal(preview.doc.exteriorMissing, true)
  assert.deepEqual(preview.doc.exteriorImages, [])
})

test('交车报告：门店确认未留外观照时透出 waived', () => {
  const preview = buildOwnerPreviewDoc({
    family: 'finish',
    acceptanceItems: [{ id: 'exterior', kind: 'exterior', name: '外观', images: [] }],
    exteriorPhotoWaived: true,
  })
  assert.equal(preview.doc.exteriorPhotoWaived, true)
})

test('交车报告：施工时长按分钟 / 小时 / 天展示', () => {
  const minutes = buildOwnerPreviewDoc({ family: 'finish', workDurationMinutes: 45 })
  assert.equal(minutes.doc.workDurationText, '约 45 分钟')
  const hours = buildOwnerPreviewDoc({ family: 'finish', workDurationMinutes: 660 })
  assert.equal(hours.doc.workDurationText, '约 11 小时')
  const days = buildOwnerPreviewDoc({ family: 'finish', workDurationMinutes: 2880 })
  assert.equal(days.doc.workDurationText, '约 2 天')
  const halfDay = buildOwnerPreviewDoc({ family: 'finish', workDurationMinutes: 5400 })
  assert.equal(halfDay.doc.workDurationText, '约 3.8 天')
  const empty = buildOwnerPreviewDoc({ family: 'finish', workDurationMinutes: 0 })
  assert.equal(empty.doc.workDurationText, '')
})
