const assert = require('assert')
const {
  buildRuleMerchantCaseDraft,
  normalizeMerchantCaseDraft,
  stripAmountText,
  draftToAiSummary,
  hydrateDraftMediaForOwnerView,
} = require('./merchant-case-draft.service')

function run() {
  assert.ok(!/1280|元/.test(stripAmountText('方案约 1280 元，压套即可')))
  assert.ok(!/1280|元/.test(stripAmountText('共计 500 元搞定')))
  assert.ok(stripAmountText('压套即可').includes('压套'))

  const albumView = {
    serviceName: '底盘异响治理',
    vehicleDisplay: '宝马 3系',
    storeName: '武侯精修店',
    storeAddress: '武侯区某路 88 号',
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
  assert.ok(draft.title.includes('宝马 3系'))
  assert.ok(draft.title.includes('底盘异响治理'))
  assert.ok(draft.title.includes('下摆臂胶套'))
  assert.ok(draft.title.includes('成都') || draft.title.includes('武侯'))
  assert.ok(!draft.title.includes('武侯精修店'))
  assert.ok(!draft.title.includes('某路'))
  assert.ok(!draft.title.includes('过程记录'))
  assert.ok(Array.isArray(draft.faq))
  assert.ok(draft.faq.some((item) => item.q.includes('总成')))
  assert.ok(draft.faq.some((item) => item.q.includes('旧件')))
  assert.ok(draft.faq.every((item) => !/1280|元/.test(item.a)))
  assert.ok(draft.sections.length === 5)
  const plan = draft.sections.find((s) => s.key === 'plan')
  assert.ok(plan.body.includes('下摆臂胶套'))
  assert.ok(!/1280|元/.test(plan.body), 'plan section must not contain amount')
  assert.ok(draft.media.length >= 1)
  assert.ok(draft.media[0].maskedUrl.includes('desensitized'))
  assert.strictEqual(draft.media[0].sectionKey, 'diagnosis')

  const summary = draftToAiSummary(draft)
  assert.ok(summary.includes('胶套开裂'))
  assert.ok(summary.includes('旧件已交还'))
  assert.ok(!summary.includes('扭矩打卡'))
  assert.ok(!/1280/.test(summary))

  const handover = draft.sections.find((s) => s.key === 'handover')
  assert.ok(handover && handover.title.includes('质保'))
  const withWarranty = buildRuleMerchantCaseDraft({
    ...albumView,
    evidenceItems: [
      {
        id: 'warranty',
        duration: '配件 1 年',
        scope: '非事故二次损伤',
        note: '',
        images: [],
      },
    ],
  })
  const handover2 = withWarranty.sections.find((s) => s.key === 'handover')
  assert.ok(handover2.body.includes('配件 1 年'))
  assert.ok(handover2.body.includes('非事故二次损伤'))

  const { syncWarrantyIntoDraft } = require('./merchant-case-draft.service')
  const stale = normalizeMerchantCaseDraft({
    title: '旧标题',
    sections: [
      { key: 'handover', title: '交车与质保', body: '旧件已交还' },
    ],
    media: [],
  })
  const synced = syncWarrantyIntoDraft(stale, {
    evidenceItems: [{ id: 'warranty', duration: '漆面 2 年', scope: '', note: '' }],
  })
  assert.ok(synced.sections.find((s) => s.key === 'handover').body.includes('漆面 2 年'))
  assert.ok(synced.caseSummary.includes('漆面 2 年'))

  const normalized = normalizeMerchantCaseDraft({
    title: '测试',
    faq: [],
    sections: [{ key: 'symptom', body: '约 99 元' }],
    media: [{ nodeId: 'stage_2', idx: 0, maskedUrl: 'https://x/m.jpg', sectionKey: 'diagnosis' }],
  })
  assert.ok(!/99|元/.test(normalized.sections[0].body))

  const staleMedia = hydrateDraftMediaForOwnerView(
    {
      title: '钣喷',
      confirmedAt: '2026-01-01T00:00:00.000Z',
      sections: [{ key: 'process', body: '' }],
      media: [
        {
          nodeId: 'stage_2',
          idx: 0,
          previewUrl: 'https://example.com/a.jpg',
          maskedUrl: '',
          sectionKey: 'diagnosis',
        },
      ],
    },
    albumView,
    preMaskTask,
  )
  assert.ok(staleMedia.media[0].maskedUrl.includes('desensitized'))

  const emptyMedia = hydrateDraftMediaForOwnerView(
    {
      title: '钣喷',
      confirmedAt: '2026-01-01T00:00:00.000Z',
      sections: [{ key: 'process', body: '局部补漆' }],
      media: [],
    },
    albumView,
    preMaskTask,
  )
  assert.ok(emptyMedia.media.length >= 1)
  assert.ok(emptyMedia.media[0].maskedUrl.includes('desensitized'))

  const crowded = {
    ...albumView,
    imageMeta: [
      ...Array.from({ length: 8 }).map((_, idx) => ({
        nodeId: 'stage_2',
        idx,
        rawUrl: `https://example.com/d${idx}.jpg`,
        visibility: 'public',
        publicGateStatus: 'passed',
      })),
      {
        nodeId: 'stage_6',
        idx: 0,
        rawUrl: 'https://example.com/handover.jpg',
        visibility: 'public',
        publicGateStatus: 'pending',
        caption: '液压位',
      },
    ],
  }
  const crowdedDraft = buildRuleMerchantCaseDraft(crowded, null)
  assert.ok(
    crowdedDraft.media.some((item) => item.nodeId === 'stage_6'),
    'handover photo must not be dropped by the 8-image cap',
  )
  const handoverMedia = crowdedDraft.media.find((item) => item.nodeId === 'stage_6')
  assert.ok(handoverMedia.caption === '液压位')
  assert.ok(handoverMedia.hint.includes('液压位'))
  assert.ok(!/偏低|加满|正常/.test(handoverMedia.hint))

  console.log('merchant-case-draft.test.js OK')
}

run()
