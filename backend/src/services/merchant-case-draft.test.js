const assert = require('assert')
const {
  buildRuleMerchantCaseDraft,
  normalizeMerchantCaseDraft,
  mergeLlmSectionsIntoDraft,
  stripAmountText,
  draftToAiSummary,
  hydrateDraftMediaForOwnerView,
  pickDraftMedia,
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
  assert.ok(!/本图为「/.test(handoverMedia.hint + handoverMedia.caption))
  assert.ok(!/偏低|加满/.test(handoverMedia.hint))

  const hangzhou = buildRuleMerchantCaseDraft({
    ...albumView,
    serviceName: '底盘维修',
    storeName: '杭州盈简科技有限公司',
    storeAddress: '浙江省杭州市西湖区龙井路1号',
    store: {},
    vehicleDisplay: '起亚 赛拉图 1.6L 三厢 手动;自动 前轮驱动',
    planParts: [],
  })
  assert.ok(hangzhou.title.includes('杭州西湖'))
  assert.ok(!hangzhou.title.includes('省杭州'))
  assert.ok(!hangzhou.title.includes('盈简'))
  assert.ok(!hangzhou.title.includes('龙井'))
  assert.ok(hangzhou.title.includes('起亚'))
  assert.ok(!/1\.6L/.test(hangzhou.title))
  assert.ok(!/本单已处理/.test(hangzhou.caseSummary))

  const outcomeMedia = buildRuleMerchantCaseDraft({
    ...albumView,
    imageMeta: [
      {
        nodeId: 'stage_5',
        idx: 0,
        rawUrl: 'https://example.com/wiper.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        caption: '已更换;',
      },
    ],
  }, null)
  const wiper = outcomeMedia.media.find((item) => item.nodeId === 'stage_5')
  assert.ok(wiper)
  assert.ok(wiper.caption !== '已更换;')
  assert.ok(!/本图为「已更换/.test(`${wiper.caption}${wiper.hint}`))
  assert.ok(!/以图中为准/.test(`${wiper.caption}${wiper.hint}`))

  const checklistDraft = buildRuleMerchantCaseDraft({
    serviceName: '小保养',
    vehicleDisplay: '起亚 赛拉图',
    store: { city: '杭州' },
    storeAddress: '浙江省杭州市西湖区龙井路1号',
    nodes: [{ id: 'stage_2', note: '' }, { id: 'stage_5', note: '' }, { id: 'stage_6', note: '' }],
    checklistJson: {
      categoryId: 'maintenance',
      items: [
        { itemKey: 'odo', outcome: 'observed' },
        { itemKey: 'brake_fluid_level', outcome: 'normal' },
        { itemKey: 'wiper', outcome: 'replaced' },
        { itemKey: 'lights', outcome: 'recommend_replace', work: { removedAs: 'follow_up' } },
        { itemKey: 'dtc', work: { removedAs: 'skipped' } },
      ],
    },
    imageMeta: [
      {
        id: 'img-odo',
        nodeId: 'stage_1',
        idx: 0,
        rawUrl: 'https://example.com/odo.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        checklistItemKey: 'odo',
      },
      {
        id: 'img-brake',
        nodeId: 'stage_2',
        idx: 0,
        rawUrl: 'https://example.com/brake.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        checklistItemKey: 'brake_fluid_level',
        caption: '正常;',
      },
      {
        id: 'img-wiper',
        nodeId: 'stage_5',
        idx: 0,
        rawUrl: 'https://example.com/wiper.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        checklistItemKey: 'wiper',
        caption: '已更换;',
      },
      {
        id: 'img-lights',
        nodeId: 'stage_2',
        idx: 1,
        rawUrl: 'https://example.com/lights.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        checklistItemKey: 'lights',
        caption: '建议更换;',
      },
    ],
  }, null)
  const diagnosis = checklistDraft.sections.find((s) => s.key === 'diagnosis')
  const process = checklistDraft.sections.find((s) => s.key === 'process')
  const handoverSec = checklistDraft.sections.find((s) => s.key === 'handover')
  assert.ok(diagnosis.body.includes('本次检查'))
  assert.ok(diagnosis.body.includes('刹车油液位'))
  assert.ok(diagnosis.body.includes('雨刮器'))
  assert.ok(!diagnosis.body.includes('里程表'))
  assert.ok(!diagnosis.body.includes('故障码'))
  assert.ok(process.body.includes('本次施工'))
  assert.ok(process.body.includes('雨刮器'))
  assert.ok(handoverSec.body.includes('灯光'))
  assert.ok(handoverSec.body.includes('择日'))
  assert.ok(!handoverSec.body.includes('另有建议项'))
  assert.ok(checklistDraft.caseSummary.includes('检查了'))
  assert.ok(checklistDraft.caseSummary.includes('雨刮器'))
  assert.ok(checklistDraft.caseSummary.includes('检查正常') || checklistDraft.caseSummary.includes('未施工'))
  assert.ok(!/本单已处理/.test(checklistDraft.caseSummary))
  assert.ok(checklistDraft.faq.some((item) => item.q.includes('查了')))
  assert.ok(checklistDraft.faq.some((item) => item.q.includes('做了')))
  assert.ok(checklistDraft.faq.some((item) => item.q.includes('没施工')))
  assert.ok(checklistDraft.faq.every((item) => !/偏低|性价比|暂缓/.test(item.a)))
  assert.ok(checklistDraft.title.includes('雨刮器'))
  assert.strictEqual(diagnosis.title, '检查留证')
  assert.strictEqual(process.title, '施工留证')
  assert.ok(checklistDraft.faq.every((item) => !/本单已处理/.test(`${item.q}${item.a}`)))
  assert.ok(!checklistDraft.faq.some((item) => /另有建议项/.test(item.a)))
  checklistDraft.media.forEach((item) => {
    assert.ok(!/本图为|以图中为准/.test(`${item.caption || ''}${item.hint || ''}`))
  })
  const brakePic = checklistDraft.media.find((item) => item.nodeId === 'stage_2' && Number(item.idx) === 0)
  if (brakePic) {
    assert.ok(brakePic.caption === '刹车油液位 正常' || brakePic.caption === '正常')
    assert.ok(!brakePic.hint)
  }

  const lockedTitles = normalizeMerchantCaseDraft({
    title: '测',
    sections: [{ key: 'diagnosis', title: '诊断与数据', body: '胶套开裂' }],
    media: [],
  })
  assert.strictEqual(lockedTitles.sections.find((s) => s.key === 'diagnosis').title, '检查留证')

  const polishedPlan = mergeLlmSectionsIntoDraft(
    {
      title: '测',
      sections: [{ key: 'plan', title: '方案与避坑', body: '更换机油机滤' }],
      media: [],
    },
    {
      sections: [{ key: 'plan', title: '方案与避坑', body: '按手册要求更换机油机滤' }],
    },
    { nodes: [{ id: 'stage_3', note: '更换机油机滤' }] },
  )
  const planBody = polishedPlan.sections.find((s) => s.key === 'plan').body
  assert.ok(!/按手册要求/.test(planBody))
  assert.ok(planBody.includes('机油'))

  const needHandle = buildRuleMerchantCaseDraft({
    ...albumView,
    imageMeta: [
      {
        nodeId: 'stage_2',
        idx: 0,
        rawUrl: 'https://example.com/need.jpg',
        visibility: 'public',
        publicGateStatus: 'passed',
        caption: '需处理;',
      },
    ],
  }, null)
  const needPic = needHandle.media.find((item) => item.nodeId === 'stage_2')
  assert.ok(needPic)
  assert.ok(!needPic.caption)
  assert.ok(!needPic.hint)
  assert.ok(!/以图中为准|本图为/.test(`${needPic.caption || ''}${needPic.hint || ''}`))

  const unmaskedOnly = pickDraftMedia(albumView, null, { requireMasked: true })
  assert.strictEqual(unmaskedOnly.length, 0)
  const previewFallback = pickDraftMedia(albumView, null)
  assert.ok(previewFallback.length >= 1)
  assert.ok(previewFallback[0].previewUrl)
  const maskedOnly = pickDraftMedia(albumView, preMaskTask, { requireMasked: true })
  assert.ok(maskedOnly.length >= 1)
  assert.ok(maskedOnly.every((item) => item.maskedUrl && item.maskedUrl.includes('desensitized')))

  console.log('merchant-case-draft.test.js OK')
}

run()
