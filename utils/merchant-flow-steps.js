/**
 * 商家时间线：存储仍是七段记录，界面收成五步。
 * 接车 → 检测（含检测报告）→ 报价 → 施工 → 完工（含交车照片和交车报告）
 * 施工中新发现会再插入一轮报价和施工，不并进第一次。
 */

function stepOf(node = {}) {
  const kind = String(node.kind || '')
  const id = String(node.id || '')
  if (kind === 'intake' || kind === 'intake_inspection') return { key: 'intake', title: '接车' }
  if (kind === 'inspection' || kind === 'inspection_report') return { key: 'inspect', title: '检测' }
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') {
    return { key: `quote:${id || kind}`, title: '报价' }
  }
  if (kind === 'work') return { key: `work:${id || kind}`, title: '施工' }
  if (kind === 'delivery_photos' || kind === 'repair_report') return { key: 'finish', title: '完工' }
  return { key: kind || id || 'step', title: String(node.title || '').trim() || '进度' }
}

function withStepOrdinal(title, stepNo) {
  const text = String(title || '').trim()
  const n = Number(stepNo)
  if (!text || !Number.isFinite(n) || n < 1) return text
  if (/^第\s*\d+\s*步/.test(text)) return text
  return `第${n}步 · ${text}`
}

/** 对外单据名。内部 kind 不变。 */
function merchantDocTitle(kind) {
  if (kind === 'inspection_report') return '检测报告'
  if (kind === 'quote_confirm' || kind === 'addon_quote_confirm') return '报价单'
  if (kind === 'work') return '维修工单'
  if (kind === 'repair_report') return '交车报告'
  return ''
}

function preferDetail(prev, row) {
  if (row.detailKind === 'doc_sheet' && prev.detailKind !== 'doc_sheet') {
    return { ...row, id: prev.id || row.id }
  }
  return prev
}

function presentMerchantTimeline(completedSteps = [], active = null) {
  const rows = (completedSteps || []).map((step) => ({ ...step, _step: stepOf(step) }))
  const activeStep = active ? stepOf(active) : null
  while (rows.length && activeStep && rows[rows.length - 1]._step.key === activeStep.key) {
    rows.pop()
  }
  const folded = []
  rows.forEach((row) => {
    const prev = folded[folded.length - 1]
    if (prev && prev._step.key === row._step.key) {
      const picked = preferDetail(prev, row)
      folded[folded.length - 1] = { ...picked, _step: prev._step }
      return
    }
    folded.push(row)
  })
  const completed = folded.map((row, index) => {
    const next = { ...row }
    delete next._step
    return {
      ...next,
      title: withStepOrdinal(row._step.title, index + 1),
    }
  })
  return {
    completed,
    activeTitle: activeStep ? withStepOrdinal(activeStep.title, completed.length + 1) : '',
  }
}

module.exports = {
  stepOf,
  merchantDocTitle,
  presentMerchantTimeline,
}
