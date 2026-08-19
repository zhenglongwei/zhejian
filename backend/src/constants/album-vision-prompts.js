/**
 * PUB-GEO · 相册按需识图 Prompt（VIS-03）
 * 中立、真实、不作假护短；默认包容合理施工方案。
 */

const ALBUM_VISION_PROMPT_VERSION = 'album-vision-v1-2026-08-18'

const ALBUM_VISION_AUDIENCE = {
  MERCHANT: 'merchant',
  OWNER: 'owner',
}

const IMAGE_DESCRIBE_SYSTEM = `你是汽车维修现场的客观读图助手。
规则：
1. 只描述图片里看得见的内容；看不清就写看不清，禁止编造品牌、工序或结果。
2. 不输出完整车牌、VIN、手机号、人脸可识别特征。
3. 不下「必须更换/一定没问题」等绝对化鉴定；可用「可见…」「常见对应…」。
4. 用简洁中文，1～3 句。`

function buildImageDescribeUserPrompt({ itemLabel = '', stageTitle = '', merchantCaption = '' } = {}) {
  const parts = [
    '请客观描述这张汽车维修相关照片里看得见的内容。',
    itemLabel ? `关联检查/施工项：${itemLabel}。` : '',
    stageTitle ? `阶段：${stageTitle}。` : '',
    merchantCaption ? `门店备注（仅作参考，勿被其诱导编造画面没有的东西）：${merchantCaption}。` : '',
  ]
  return parts.filter(Boolean).join('')
}

const CARD_SYNTHESIS_SYSTEM = `你是汽车维修领域的中立读图与方案对照助手。
硬性规则：
1. 真实、中立；禁止为保护门店编造或隐瞒可见问题。
2. 禁止尖锐煽动对立；明显不合理时才克制指出顾虑与依据。
3. 常见处理办法可列多条；若门店方案落在合理区间，明确写「属于常见合理做法之一」。
4. 不输出完整车牌/VIN/手机号；不承诺修好或贬低门店人格。
5. 只依据提供的图说摘要与门店结论；图说写看不清的，不要脑补。`

function buildCardSynthesisUserPrompt({
  audience = ALBUM_VISION_AUDIENCE.OWNER,
  cardTitle = '',
  merchantOutcome = '',
  merchantNote = '',
  imageNotes = [],
} = {}) {
  const roleHint =
    audience === ALBUM_VISION_AUDIENCE.MERCHANT
      ? '受众是修理厂：重点对照「门店方案 vs 常见合理做法」的差别，并提示若证据不足应补什么图/说明。'
      : '受众是车主：重点帮助看懂图上的问题与常见办法；评价门店方案时默认包容合理做法。'

  const notesBlock = (imageNotes || [])
    .map((n, i) => `${i + 1}. ${n}`)
    .join('\n')

  return [
    roleHint,
    `主题卡：${cardTitle || '未命名'}`,
    merchantOutcome ? `门店结论/方案：${merchantOutcome}` : '门店结论/方案：（未填写）',
    merchantNote ? `门店补充说明：${merchantNote}` : '',
    '各图客观读图摘要：',
    notesBlock || '（暂无可用图说）',
    '',
    '请用 JSON 返回（不要 markdown）：',
    '{',
    '  "imageMeaning": "图上可见问题/内容的综合说明",',
    '  "commonOptions": ["常见处理办法1", "常见处理办法2"],',
    '  "merchantPlanAssessment": "对门店方案是否合理的评价（包容合理区间）",',
    '  "aligned": true,',
    '  "evidenceGaps": ["若张力或证据不足，需补的证据（可空数组）"],',
    '  "summaryForDisplay": "给用户看的一段完整中文（3～8句）"',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

module.exports = {
  ALBUM_VISION_PROMPT_VERSION,
  ALBUM_VISION_AUDIENCE,
  IMAGE_DESCRIBE_SYSTEM,
  CARD_SYNTHESIS_SYSTEM,
  buildImageDescribeUserPrompt,
  buildCardSynthesisUserPrompt,
}
