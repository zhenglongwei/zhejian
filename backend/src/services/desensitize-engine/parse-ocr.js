const { boxFromPoints, boxFromLtwh } = require('./bbox')

const PHONE_RE = /1[3-9]\d{9}/
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i
const DOC_KEYWORDS = ['结算', '定损', '保险', '身份证', '行驶证', '驾驶证', '保单', '报案']

function safeParseData(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function boxesFromKeyValueInfo(list, type, matchFn) {
  const out = []
  ;(list || []).forEach((item) => {
    const value = String(item.value || item.Value || '')
    const key = String(item.key || item.Key || '')
    const text = `${key}${value}`
    if (matchFn && !matchFn(text, value, key)) return
    const pos = item.valuePos || item.ValuePos || item.pos || item.Pos
    const box = boxFromPoints(pos, type, 'ocr')
    if (box) out.push(box)
  })
  return out
}

function boxesFromWordsInfo(list, type, matchFn) {
  const out = []
  ;(list || []).forEach((item) => {
    const word = String(item.word || item.Word || item.content || '')
    if (!word) return
    if (matchFn && !matchFn(word, word, '')) return
    const pos = item.pos || item.Pos
    const box = boxFromPoints(pos, type, 'ocr')
    if (box) out.push(box)
  })
  return out
}

function parsePlateBoxes(data) {
  const parsed = safeParseData(data)
  if (!parsed) return []
  const boxes = []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo
  boxes.push(...boxesFromKeyValueInfo(kv, 'plate', () => true))

  const structures = parsed.structure_list || parsed.structureList || []
  structures.forEach((item) => {
    const pos = item.pos || item.valuePos
    const box = boxFromPoints(pos, 'plate', 'carNumber')
    if (box) boxes.push(box)
  })

  if (parsed.plate_list) {
    parsed.plate_list.forEach((p) => {
      const roi = p.roi || p.Roi
      if (roi && Number.isFinite(roi.left)) {
        const b = boxFromLtwh(roi.left, roi.top, roi.width, roi.height, 'plate', 'carNumber')
        if (b) boxes.push(b)
      }
    })
  }
  return boxes
}

function parseVinBoxes(data) {
  const parsed = safeParseData(data)
  if (!parsed) return []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo
  return boxesFromKeyValueInfo(kv, 'vin', (text, value) => VIN_RE.test(value) || VIN_RE.test(text))
}

function parseGeneralSensitiveBoxes(data) {
  const parsed = safeParseData(data)
  if (!parsed) return []
  const boxes = []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo
  const words = parsed.prism_wordsInfo || parsed.prism_wordsinfo

  const phoneMatch = (text) => PHONE_RE.test(text.replace(/\s/g, ''))
  const vinMatch = (text) => VIN_RE.test(text)
  const docMatch = (text) => DOC_KEYWORDS.some((k) => text.includes(k))

  boxes.push(...boxesFromKeyValueInfo(kv, 'phone', (t, v) => phoneMatch(v) || phoneMatch(t)))
  boxes.push(...boxesFromKeyValueInfo(kv, 'vin', (t, v) => vinMatch(v) || vinMatch(t)))
  boxes.push(...boxesFromKeyValueInfo(kv, 'document', (t, v) => docMatch(v) || docMatch(t)))

  boxes.push(...boxesFromWordsInfo(words, 'phone', (w) => phoneMatch(w)))
  boxes.push(...boxesFromWordsInfo(words, 'vin', (w) => vinMatch(w)))
  boxes.push(...boxesFromWordsInfo(words, 'document', (w) => docMatch(w)))

  return boxes
}

module.exports = {
  parsePlateBoxes,
  parseVinBoxes,
  parseGeneralSensitiveBoxes,
  safeParseData,
}
