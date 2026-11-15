const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseQuoteAssistPayload,
  parseSuggestedLines,
  parseDisposition,
  dispositionLabel,
  refineDispositionScope,
  quoteAssistHasContent,
} = require('./quote-assist')

test('parse suggested lines keeps names, bands, reason and optional', () => {
  const lines = parseSuggestedLines([
    {
      name: '更换机油机滤',
      note: '更换机油与机滤',
      kind: 'parts',
      oem: '480-680',
      brand: '320-450',
      economy: '220-320',
      reason: '机油到期，滤芯堵塞。',
      optional: false,
    },
    {
      name: '底盘拆检',
      kind: 'labor',
      dealer: '300-600',
      indie: '150-300',
      reason: '观察渗油，可由车主选择是否拆检。',
      optional: true,
    },
    { name: '  ' },
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines[0].name, '更换机油机滤')
  assert.equal(lines[0].oem, '480-680')
  assert.equal(lines[0].economy, '220-320')
  assert.equal(lines[0].reason, '机油到期，滤芯堵塞。')
  assert.equal(lines[0].optional, false)
  assert.equal(lines[1].kind, 'labor')
  assert.equal(lines[1].dealer, '300-600')
  assert.equal(lines[1].optional, true)
})

test('parse quote assist keeps refs and omissions; drops objections/photoPlan', () => {
  const got = parseQuoteAssistPayload({
    analysis: {
      summary: '主诉异响，前片偏薄。',
      omissions: [
        {
          name: '更换后刹车片',
          kind: 'parts',
          oem: '约300-500',
          brand: '约200-350',
          economy: '约120-220',
          reason: '检测写了后片偏薄，表上还没有。',
        },
      ],
      objections: ['为什么不换盘'],
      photoPlan: [{ title: '新旧对比', body: '应在施工' }],
      necessity: [{ title: '更换前刹车片', body: '片薄到极限，继续开有风险。' }],
    },
    suggestedLines: [
      { name: '更换前刹车片', kind: 'parts', oem: '380-520', brand: '220-320', economy: '150-220' },
    ],
  })
  assert.equal(got.reportPrefill, '')
  assert.equal(got.summary, '')
  assert.equal(got.omissions.length, 1)
  assert.equal(got.omissions[0].name, '更换后刹车片')
  assert.equal(got.omissions[0].oem, '约300-500')
  assert.equal(got.objections.length, 0)
  assert.equal(got.photoPlan.length, 0)
  assert.equal(got.necessity.length, 0)
  assert.equal(got.suggestedLines[0].name, '更换前刹车片')
  assert.equal(got.suggestedLines[0].oem, '380-520')
  assert.equal(got.suggestedLines[0].reason, '片薄到极限，继续开有风险。')
  assert.equal(quoteAssistHasContent(got), true)
})

test('omissions drop umbrella bag titles; keep atomic items with bands', () => {
  const { isUmbrellaQuoteName, parseOmissionLines } = require('./quote-assist')
  assert.equal(isUmbrellaQuoteName('建议补充常规保养项目'), true)
  assert.equal(isUmbrellaQuoteName('常规保养项目'), true)
  assert.equal(isUmbrellaQuoteName('更换机油机滤'), false)
  const lines = parseOmissionLines([
    {
      title: '建议补充常规保养项目',
      body: '建议补充机油、机滤、空滤、空调滤、火花塞、节气门清洗',
    },
    {
      name: '更换机油机滤',
      kind: 'parts',
      brand: '约400-800',
      economy: '约300-500',
      reason: '大保养到期。',
    },
    {
      name: '更换火花塞',
      kind: 'parts',
      brand: '约200-400',
      reason: '里程到期建议更换。',
    },
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines[0].name, '更换机油机滤')
  assert.equal(lines[0].brand, '约400-800')
  assert.equal(lines[1].name, '更换火花塞')
})

test('legacy objections are discarded; reason carries necessity', () => {
  const got = parseQuoteAssistPayload({
    objections: [
      {
        ask: '这是修完的总价吗',
        heard: '第一个数就是总价',
        ours: '单上有拆检',
        say: '这是先确认的范围',
      },
    ],
    suggestedLines: [
      {
        name: '前刹车片更换',
        reason: '片薄，建议更换；当面说明这是方案范围不是总价。',
      },
    ],
  })
  assert.equal(got.objections.length, 0)
  assert.match(got.suggestedLines[0].reason, /方案范围/)
})

test('补充报价处置结论：三选一 + 理由，单独结论也算有内容', () => {
  const got = parseQuoteAssistPayload({
    disposition: {
      verdict: 'merge',
      target: '更换前刹车片',
      reason: '右前轮异响和已报的前刹车片是同一处，并进原报价即可。',
    },
    suggestedLines: [],
  })
  assert.equal(got.disposition.verdict, 'merge')
  assert.equal(got.disposition.verdictLabel, '建议并入原报价')
  assert.equal(got.disposition.target, '更换前刹车片')
  assert.match(got.disposition.reason, /同一处/)
  assert.equal(quoteAssistHasContent(got), true)
})

test('先拆检结论可以没有报价行', () => {
  const got = parseQuoteAssistPayload({
    disposition: { verdict: 'inspect', reason: '只拍到轮毂，需要拆下轮胎确认扎钉位置。' },
  })
  assert.equal(got.disposition.verdict, 'inspect')
  assert.equal(got.suggestedLines.length, 0)
  assert.equal(quoteAssistHasContent(got), true)
})

test('合并目标是本次补充报价自己的行时，不能叫原报价', () => {
  const base = parseQuoteAssistPayload({
    disposition: {
      verdict: 'merge',
      target: '划痕修复',
      reason: '当前补充报价单中已列有「划痕修复」项目，无需单独新增报价行。',
    },
  })
  const refined = refineDispositionScope(base.disposition, {
    addonLines: [{ name: '划痕修复' }],
    priorQuoteLines: [{ name: '底盘维修' }, { name: '进气门清洗' }],
  })
  assert.equal(refined.scope, 'addon')
  assert.equal(dispositionLabel(refined.verdict, refined.scope), '本次补充报价已含该项目')
  // 落库后重新解析（sanitize）仍保持同一措辞
  assert.equal(parseDisposition(refined).verdictLabel, '本次补充报价已含该项目')
})

test('合并目标是以往报价的行时，维持并入原报价', () => {
  const base = parseQuoteAssistPayload({
    disposition: { verdict: 'merge', target: '底盘维修', reason: '同一处，并入原报价。' },
  })
  const refined = refineDispositionScope(base.disposition, {
    addonLines: [{ name: '划痕修复' }],
    priorQuoteLines: [{ name: '底盘维修' }],
  })
  assert.equal(refined.scope, 'prior')
  assert.equal(dispositionLabel(refined.verdict, refined.scope), '建议并入原报价')
})
