/**
 * 接车 AI意见解析与检测对照
 * 真源：docs/04_维修过程相册/26_ AI意见
 */
const crypto = require('crypto')
const { INTAKE_RECORD_CATEGORIES } = require('../../vendor/shared/constants/service-flow-nodes')
const { parseReviewModelJson } = require('./node-ai-review-rules')

const WALKAROUND_HOW = {
  odometer: '表盘入镜，不要导航。',
  fuel: '油表入镜，可与仪表同框。',
  paint: '车身四周外表，能看清进场状态。',
  glass: '前后挡与侧窗外观。',
  tire: '四条胎面、胎侧外观。',
  light: '前后灯外观。',
  belongings: '舱内或后备箱随车物。',
}

const WALKAROUND_ALIAS = {
  odometer: ['里程', '仪表', '表盘', '公里'],
  fuel: ['油量', '油表', '油位'],
  paint: ['漆面', '外观', '外表', '车身', '四角', '环车', '保险杠', '翼子板', '车门', '引擎盖', '车顶', '后备箱盖'],
  glass: ['玻璃', '挡风', '车窗'],
  tire: ['轮胎', '轮毂', '胎面', '胎侧'],
  light: ['灯光', '大灯', '尾灯'],
  belongings: ['随车', '物品', '内饰', '舱内', '后备箱', '车内'],
}

/** 举升/拆检部位，只能进检测顺序，不能进环车 */
const INSPECTION_LEAK =
  /机脚|摆臂|球头|衬套|吊耳|防尘套|半轴|举升|拆检|减震|拉杆|卡钳|刹车片|刹车盘|差速|变速箱(?!外观)|发动机(?!舱外观)/

function text(value) {
  return String(value || '').trim()
}

function checkpointId(partName, index) {
  const key = text(partName) || `ck${index}`
  return `ck_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`
}

function parseOptions(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  const seen = new Set()
  list.forEach((item) => {
    const label = text(typeof item === 'object' ? item.label || item.title || item.text : item).slice(0, 16)
    if (!label || seen.has(label)) return
    seen.add(label)
    out.push({ label })
  })
  return out.slice(0, 4)
}

function parseAskOwner(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  list.forEach((item, index) => {
    if (item && typeof item === 'object') {
      const title = text(item.title || item.part || item.name).slice(0, 16)
      const body = text(item.body || item.text || item.why).slice(0, 80)
      const options = parseOptions(item.options || item.choices)
      if (title || body || options.length) {
        out.push({ title, body, options, sortOrder: index })
      }
      return
    }
    const line = text(item)
    if (line) out.push({ title: '', body: line.slice(0, 80), options: [], sortOrder: index })
  })
  return out.slice(0, 4)
}

function parseTitleBodyList(raw, max = 6) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  list.forEach((item, index) => {
    if (item && typeof item === 'object') {
      const title = text(item.title || item.part || item.name).slice(0, 16)
      const body = text(item.body || item.text || item.why || item.how).slice(0, 72)
      const categoryId = text(item.categoryId || item.category || item.id)
      if (title || body || categoryId) out.push({ title, body, categoryId, sortOrder: index })
      return
    }
    const line = text(item)
    if (line) out.push({ title: '', body: line.slice(0, 72), categoryId: '', sortOrder: index })
  })
  return out.slice(0, max)
}

function walkaroundCategoryById(id) {
  return INTAKE_RECORD_CATEGORIES.find((row) => row.id === id) || null
}

function matchWalkaroundCategory(title, body, categoryId) {
  const blob = `${title}${body}`
  if (INSPECTION_LEAK.test(blob)) return null
  const byId = walkaroundCategoryById(categoryId)
  if (byId) return byId
  const hay = text(title) || text(body)
  if (!hay) return null
  const exact = INTAKE_RECORD_CATEGORIES.find((row) => hay === row.label || hay.includes(row.label))
  if (exact) return exact
  return (
    INTAKE_RECORD_CATEGORIES.find((row) => {
      const keys = WALKAROUND_ALIAS[row.id] || []
      return keys.some((key) => hay.includes(key))
    }) || null
  )
}

function defaultWalkaroundPhotoTips() {
  return INTAKE_RECORD_CATEGORIES.map((row, index) => ({
    title: row.label,
    body: WALKAROUND_HOW[row.id] || '',
    categoryId: row.id,
    sortOrder: index,
  }))
}

function parseWalkaroundPhotoTips(raw, options) {
  const seen = new Set()
  const out = []
  parseTitleBodyList(raw, 8).forEach((item) => {
    const meta = matchWalkaroundCategory(item.title, item.body, item.categoryId)
    if (!meta || seen.has(meta.id)) return
    seen.add(meta.id)
    const body = INSPECTION_LEAK.test(item.body) ? WALKAROUND_HOW[meta.id] : item.body || WALKAROUND_HOW[meta.id]
    out.push({
      title: meta.label,
      body: text(body).slice(0, 72),
      categoryId: meta.id,
      sortOrder: out.length,
    })
  })
  if (out.length) return out
  if (options && options.allowDefault === false) return []
  return defaultWalkaroundPhotoTips()
}

function parseCheckpoints(raw) {
  const list = Array.isArray(raw) ? raw : []
  const rows = []
  const seen = new Set()
  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const partName = text(row.partName || row.name || row.title)
    if (!partName) return
    const id = text(row.id) || checkpointId(partName, index)
    if (seen.has(id)) return
    seen.add(id)
    const priority = Number(row.priority || row.sortOrder)
    rows.push({
      id,
      partName: partName.slice(0, 20),
      why: text(row.why || row.body || row.reason).slice(0, 56),
      sortOrder: Number.isFinite(priority) ? priority : index,
    })
  })
  return rows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8)
    .map((row, index) => ({ ...row, sortOrder: index }))
}

function parseIntakeAdvicePayload(raw) {
  const parsed = parseReviewModelJson(raw) || {}
  const diagnosis = text(parsed.diagnosis || parsed.summary).slice(0, 160)
  return {
    diagnosis,
    photoTips: parseWalkaroundPhotoTips(parsed.photoTips || parsed.photos),
    askOwner: parseAskOwner(parsed.askOwner || parsed.questions),
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
    photoTips: parseWalkaroundPhotoTips(advice.photoTips, {
      allowDefault: status === 'ready',
    }),
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
  parseWalkaroundPhotoTips,
  unmatchedCheckpoints,
  sanitizeIntakeAdviceForView,
  intakeAdviceHasContent,
  checkpointId,
  defaultWalkaroundPhotoTips,
}
