const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCaseFactsSchema } = require('./case-facts-jsonld')

function buildData() {
  return {
    id: 'case_001',
    title: '右前门划痕修复',
    serviceName: '油漆修复',
    city: '杭州',
    chiefComplaint: '右前门有划痕',
    caseVehicle: { brand: '丰田', series: '卡罗拉', year: '2021款', mileageText: '3.2万公里' },
    mileageKm: 32000,
    trustMeta: {
      evidenceLevel: 'rich_images',
      evidenceLevelLabel: '图文全留证',
    },
    serviceFlow: {
      chapters: [
        {
          id: 'n1',
          kind: 'inspection_report',
          title: '检测报告',
          chiefComplaint: '右前门有划痕',
          findings: [
            { url: '', partName: '右前门漆面', result: '需处理', advice: '建议局部补漆', images: [] },
          ],
        },
        {
          id: 'n2',
          kind: 'quote_confirm',
          title: '方案',
          items: [{ name: '右前门局部补漆', brand: 'xxx漆', note: '' }],
        },
        {
          id: 'n3',
          kind: 'work',
          title: '工单',
          photos: [],
          items: [{ name: '右前门局部补漆', brand: '', note: '打磨后喷涂' }],
        },
        {
          id: 'n4',
          kind: 'repair_report',
          title: '完工',
          items: [],
          photos: [],
          acceptanceItems: [
            { id: 'acc_1', kind: 'work', name: '右前门局部补漆', result: 'pass', resultLabel: '合格', note: '', images: [{ url: '/p/a.jpg' }] },
            { id: 'exterior', kind: 'exterior', name: '外观', result: 'pass', resultLabel: '合格', note: '', images: [], missingPhoto: true },
          ],
          warrantyPeriod: '3个月',
          warrantyNotes: '同部位掉色免费返修',
          exteriorPhotoWaived: false,
        },
      ],
    },
  }
}

test('facts 块：Car 实体 + Article facts 属性', () => {
  const block = buildCaseFactsSchema({
    baseUrl: 'https://zhejian.simplewin.cn',
    canonicalPath: '/case/case_001.html',
    data: buildData(),
  })
  assert.ok(block)
  assert.equal(block['@context'], 'https://schema.org')

  const car = block['@graph'].find((node) => node['@type'] === 'Car')
  assert.ok(car)
  assert.equal(car.brand, '丰田')
  assert.equal(car.model, '卡罗拉')
  assert.equal(car.vehicleModelDate, '2021款')
  assert.equal(car.mileageFromOdometer.value, 32000)
  assert.equal(car.mileageFromOdometer.unitText, 'Km')

  const article = block['@graph'].find((node) => node['@type'] === 'Article')
  assert.ok(article)
  assert.equal(article['@id'], 'https://zhejian.simplewin.cn/case/case_001.html#article')
  assert.deepEqual(article.about, { '@id': car['@id'] })

  const byName = (name) => article.additionalProperty.find((row) => row.name === name)
  assert.equal(byName('facts.chiefComplaint').value, '右前门有划痕')
  assert.equal(byName('facts.finding').value, '右前门漆面 · 需处理 · 建议局部补漆')
  assert.equal(byName('facts.quoteItem').value, '右前门局部补漆 · xxx漆')
  assert.equal(byName('facts.workItem').value, '右前门局部补漆 · 打磨后喷涂')
  assert.equal(byName('facts.warrantyPeriod').value, '3个月')
  assert.equal(byName('facts.warrantyNotes').value, '同部位掉色免费返修')
  assert.equal(byName('evidenceLevel').value, 'rich_images')
  assert.equal(byName('evidenceLevelLabel').value, '图文全留证')
})

test('facts 块：外观缺图标注进验收行', () => {
  const block = buildCaseFactsSchema({
    baseUrl: 'https://zhejian.simplewin.cn',
    canonicalPath: '/case/case_001.html',
    data: buildData(),
  })
  const article = block['@graph'].find((node) => node['@type'] === 'Article')
  const acceptance = article.additionalProperty.filter((row) => row.name === 'facts.acceptanceItem')
  assert.equal(acceptance.length, 2)
  assert.match(acceptance[1].value, /外观 · 合格 · 商家未留外观照/)
})

test('facts 块：无事实返回 null（跳过注入）', () => {
  const block = buildCaseFactsSchema({
    baseUrl: 'https://zhejian.simplewin.cn',
    canonicalPath: '/case/case_002.html',
    data: { serviceFlow: { chapters: [] } },
  })
  assert.equal(block, null)
})

test('facts 块：缺 canonicalPath 返回 null', () => {
  const block = buildCaseFactsSchema({ baseUrl: 'https://x.cn', data: buildData() })
  assert.equal(block, null)
})

test('facts 块：质保「无」不输出', () => {
  const data = buildData()
  data.serviceFlow.chapters = data.serviceFlow.chapters.map((ch) => {
    if (ch.kind !== 'repair_report') return ch
    return { ...ch, warrantyPeriod: '无', warrantyNotes: '暂无' }
  })
  const block = buildCaseFactsSchema({
    baseUrl: 'https://zhejian.simplewin.cn',
    canonicalPath: '/case/case_001.html',
    data,
  })
  const article = block['@graph'].find((node) => node['@type'] === 'Article')
  assert.ok(!article.additionalProperty.some((row) => row.name === 'facts.warrantyPeriod'))
  assert.ok(!article.additionalProperty.some((row) => row.name === 'facts.warrantyNotes'))
})
