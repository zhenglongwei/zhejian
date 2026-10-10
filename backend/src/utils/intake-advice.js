/**
 * 接车 AI意见解析与检测对照
 * 真源：docs/04_维修过程相册/26_ AI意见
 */
const crypto = require('crypto')
const { parseReviewModelJson } = require('./node-ai-review-rules')

function text(value) {
  return String(value || '').trim()
}

function checkpointId(partName, index) {
  const key = text(partName) || `ck${index}`
  return `ck_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`
}

function parseTitleBodyList(raw, max = 8) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  list.forEach((item, index) => {
    if (item && typeof item === 'object') {
      const title = text(item.title || item.part || item.name).slice(0, 20)
      const body = text(item.body || item.text || item.why || item.how).slice(0, 160)
      if (title || body) out.push({ title, body, sortOrder: index })
      return
    }
    const line = text(item)
    if (line) out.push({ title: '', body: line.slice(0, 160), sortOrder: index })
  })
  return out.slice(0, max)
}

function parseCheckpoints(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  const seen = new Set()
  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const partName = text(row.partName || row.name || row.title)
    if (!partName) return
    const id = text(row.id) || checkpointId(partName, index)
    if (seen.has(id)) return
    seen.add(id)
    out.push({
      id,
      partName: partName.slice(0, 24),
      why: text(row.why || row.body || row.reason).slice(0, 120),
      sortOrder: index,
    })
  })
  return out.slice(0, 12)
}

function parseIntakeAdvicePayload(raw) {
  const parsed = parseReviewModelJson(raw) || {}
  const diagnosis = text(parsed.diagnosis || parsed.summary).slice(0, 400)
  return {
    diagnosis,
    photoTips: parseTitleBodyList(parsed.photoTips || parsed.photos, 8),
    askOwner: parseTitleBodyList(parsed.askOwner || parsed.questions, 6),
    checkpoints: parseCheckpoints(parsed.checkpoints || parsed.inspectPoints),
  }
}

function normalizePart(name) {
  return text(name).replace(/\s+/g, '').replace(/[左右前后内外侧上下]/g, '')
}

function unmatchedCheckpoints(checkpoints, findings) {
  const names = (Array.isArray(findings) ? findings : [])
    .map((row) => normalizePart(row && row.partName))
    .filter(Boolean)
  return (Array.isArray(checkpoints) ? checkpoints : []).filter((ck) => {
    const key = normalizePart(ck && ck.partName)
    if (!key) return false
    return !names.some((name) => name.includes(key) || key.includes(name))
  })
}

function sanitizeIntakeAdviceForView(advice) {
  if (!advice || typeof advice !== 'object') return null
  const status = text(advice.status)
  if (!status) return null
  return {
    status,
    diagnosis: text(advice.diagnosis),
    photoTips: Array.isArray(advice.photoTips) ? advice.photoTips : [],
    askOwner: Array.isArray(advice.askOwner) ? advice.askOwner : [],
    checkpoints: Array.isArray(advice.checkpoints) ? advice.checkpoints : [],
    waitHint: status === 'queued' || status === 'running' ? '正在出意见' : '',
    errorMessage: status === 'failed' ? text(advice.errorMessage) || '未能出意见' : '',
    updatedAt: text(advice.updatedAt),
  }
}

function intakeAdviceHasContent(advice) {
  if (!advice || typeof advice !== 'object') return false
  return Boolean(
    text(advice.diagnosis) ||
      (advice.photoTips && advice.photoTips.length) ||
      (advice.askOwner && advice.askOwner.length) ||
      (advice.checkpoints && advice.checkpoints.length),
  )
}

module.exports = {
  parseIntakeAdvicePayload,
  unmatchedCheckpoints,
  sanitizeIntakeAdviceForView,
  intakeAdviceHasContent,
  checkpointId,
}
