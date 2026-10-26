/**
 * 案例 GEO 提示词：单据链原料是否真进了提示词
 */
const assert = require('assert')
const { buildUserPrompt } = require('./case-geo-llm.service')
const { buildCaseFactPack } = require('../utils/case-geo-factpack')

function flowNode(kind, extra = {}) {
  return { id: `fn_${kind}`, kind, title: kind, sortOrder: 0, ...extra }
}

const FLOW = [
  flowNode('intake', {
    photoDraft: { chiefComplaint: '过减速带时右前轮咯噔响' },
    document: { status: 'confirmed', payload: {} },
  }),
  flowNode('inspection_report', {
    document: {
      status: 'delivered',
      payload: {
        chiefComplaint: '过减速带时右前轮咯噔响',
        vehicleBrand: '大众',
        vehicleSeries: '高尔夫',
        mileageText: '里程 62000 km',
        findings: [
          {
            partName: '右前小吊杆球头',
            result: '需处理',
            advice: '球头松旷，胶套开裂',
            images: [],
          },
        ],
      },
    },
  }),
  flowNode('quote_confirm', {
    document: {
      status: 'confirmed',
      payload: { lines: [{ name: '更换右前小吊杆', amount: 680 }] },
    },
  }),
  flowNode('work', {
    status: 'completed',
    photoDraft: {
      findings: [
        { partName: '更换右前小吊杆', caption: '旧件胶套已开裂', outsideQuote: false },
      ],
    },
    document: { status: 'confirmed', payload: {} },
  }),
  flowNode('repair_report', {
    document: {
      status: 'confirmed',
      payload: {
        conclusion: '异响消除',
        warrantyPeriod: '12个月',
        deliveryPhotos: [{ url: 'https://x/d.jpg' }],
      },
    },
  }),
]

function baseCtx(extra = {}) {
  return {
    row: { city: '杭州', storeName: '城北店', serviceName: '底盘异响检修' },
    albumView: { vehicle: { brand: '大众', series: '高尔夫' } },
    nodes: [{ id: 'stage_2', title: '检测', note: '前片磨损' }],
    templatePayload: {
      aiSummary: '',
      seoTitle: 't',
      seoDescription: 'd',
      articleBody: 'b',
      contentJson: { geo: { faultDesc: '', inspectResult: '', repairPlan: '', resultConfirm: '' } },
    },
    ...extra,
  }
}

function testFactsEnterPrompt() {
  const ctx = baseCtx({ factPack: buildCaseFactPack(FLOW) })
  const parsed = JSON.parse(buildUserPrompt(ctx))
  assert.ok(parsed.facts, '有单据链时应带 facts 块')
  assert.equal(parsed.facts.chiefComplaint, '过减速带时右前轮咯噔响')
  assert.equal(parsed.facts.findings.length, 1)
  assert.equal(parsed.facts.findings[0].partName, '右前小吊杆球头')
  assert.equal(parsed.facts.workItems[0].name, '更换右前小吊杆')
  assert.equal(parsed.facts.finish.conclusion, '异响消除')
  assert.deepEqual(parsed.facts.quoteItems, ['更换右前小吊杆'])
}

/** 藏价：金额不得出现在提示词里 */
function testPromptNeverCarriesAmount() {
  const ctx = baseCtx({ factPack: buildCaseFactPack(FLOW) })
  const prompt = buildUserPrompt(ctx)
  assert.ok(!prompt.includes('680'), '提示词不得包含金额')
  assert.ok(!prompt.includes('amount'), '提示词不得出现 amount 字段')
}

/** 老相册无单据链：不带 facts，但仍保留 nodes，不开天窗 */
function testLegacyKeepsNodesWithoutFacts() {
  const ctx = baseCtx({ factPack: buildCaseFactPack([]) })
  const parsed = JSON.parse(buildUserPrompt(ctx))
  assert.equal(parsed.facts, undefined, '无单据链时不带 facts')
  assert.equal(parsed.nodes.length, 1)
  assert.equal(parsed.nodes[0].note, '前片磨损')
}

/** 图片 key 不进提示词：那是给分流用的，不是素材 */
function testAnalyzedImageKeysNotInPrompt() {
  const ctx = baseCtx({ factPack: buildCaseFactPack(FLOW) })
  const prompt = buildUserPrompt(ctx)
  assert.ok(!prompt.includes('analyzedImageKeys'))
}

testFactsEnterPrompt()
testPromptNeverCarriesAmount()
testLegacyKeepsNodesWithoutFacts()
testAnalyzedImageKeysNotInPrompt()
console.log('case-geo-llm-prompt.test.js OK')
