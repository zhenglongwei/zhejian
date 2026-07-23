const assert = require('assert')
const {
  buildRuleMerchantCaseDraft,
  normalizeMerchantCaseDraft,
  stripAmountText,
  draftToAiSummary,
} = require('./merchant-case-draft.service')

function run() {
  assert.ok(!/1280|元/.test(stripAmountText('方案约 1280 元，压套即可')))
  assert.ok(!/1280|元/.test(stripAmountText('共计 500 元搞定')))
  assert.ok(stripAmountText('压套即可').includes('压套'))

  const albumView = {
    serviceName: '底盘异响治理',
    vehicleDisplay: '宝马 3系',
    store: { city: '成都', name: '武侯店' },
    planAmount: 1280,
    planParts: [{ name: '下摆臂胶套', partType: '原厂品质' }],
    nodes: [
      { id: 'stage_1', note: '过减速带异响' },
      { id: 'stage_2', note: '胶套开裂，球头无旷量' },
      { id: 'stage_3', note: '无需换总成，压套即可，参考 1280 元' },
      { id: 'stage_5', note: '扭矩打卡，防松标记' },
      { id: 'stage_6', note: '旧件已交还' },
    ],
    imageMeta: [
      {
        nodeId: 'stage_2',
        idx: 0,
        rawUrl: 'https://example.com/a.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
      },
      {
        nodeId: 'stage_5',
        idx: 0,
        rawUrl: 'https://example.com/b.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
      },
    ],
  }

  const preMaskTask = {
    assets: [
      {
        nodeId: 'stage_2',
        idx: 0,
        rawUrl: 'https://example.com/a.jpg',
        maskedUrl: 'https://cdn.example.com/api/v1/media/files/uploads/desensitized/alb_x/stage_2_0.jpg',
      },
      {
        nodeId: 'stage_5',
        idx: 0,
        rawUrl: 'https://example.com/b.jpg',
        maskedUrl: 'https://cdn.example.com/api/v1/media/files/uploads/desensitized/alb_x/stage_5_0.jpg',
      },
    ],
  }

  const draft = buildRuleMerchantCaseDraft(albumView, preMaskTask)
  assert.ok(draft.title.includes('成都'))
  assert.ok(draft.sections.length === 5)
  const plan = draft.sections.find((s) => s.key === 'plan')
  assert.ok(plan.body.includes('下摆臂胶套'))
  assert.ok(!/1280|元/.test(plan.body), 'plan section must not contain amount')
  assert.ok(draft.media.length >= 1)
  assert.ok(draft.media[0].maskedUrl.includes('desensitized'))
  assert.strictEqual(draft.media[0].sectionKey, 'diagnosis')

  const summary = draftToAiSummary(draft)
  assert.ok(summary.includes('诊断'))
  assert.ok(!/1280/.test(summary))

  const normalized = normalizeMerchantCaseDraft({
    title: '测试',
    sections: [{ key: 'symptom', body: '约 99 元' }],
    media: [{ nodeId: 'stage_2', idx: 0, maskedUrl: 'https://x/m.jpg', sectionKey: 'diagnosis' }],
  })
  assert.ok(!/99|元/.test(normalized.sections[0].body))

  console.log('merchant-case-draft.test.js OK')
}

run()
