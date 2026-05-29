const { boxFromPoints, boxFromLtwh } = require('./bbox')

const PHONE_RE = /1[3-9]\d{9}/
const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i
const DOC_KEYWORDS = ['结算', '定损', '保险', '身份证', '行驶证', '驾驶证', '保单', '报案']
const PLATE_TEXT_RE = /[\u4e00-\u9fa5][A-Z][·\s]?[A-Z0-9]{4,6}/i

function safeParseData(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function unwrapOcrRoot(parsed) {
  let node = parsed
  for (let i = 0; i < 4 && node; i += 1) {
    if (node.data && typeof node.data === 'object' && !Array.isArray(node.data)) {
      const inner = node.data
      if (
        inner.prism_keyValueInfo ||
        inner.prism_wordsInfo ||
        inner.structure_list ||
        inner.info ||
        inner.orgWidth
      ) {
        node = inner
        continue
      }
      if (inner.data && typeof inner.data === 'object') {
        node = inner
        continue
      }
    }
    break
  }
  return node || parsed
}

function parseValueLocString(loc, type = 'plate', source = 'value_loc') {
  if (!loc || typeof loc !== 'string') return null
  const nums = loc.split(/[,，\s]+/).map(Number).filter(Number.isFinite)
  if (nums.length >= 8) {
    const points = []
    for (let i = 0; i + 1 < nums.length; i += 2) {
      points.push({ x: nums[i], y: nums[i + 1] })
    }
    return boxFromPoints(points, type, source)
  }
  return null
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
    if (box) {
      out.push(box)
      return
    }
    const loc = item.value_loc || item.valueLoc || item.ValueLoc
    const locBox = parseValueLocString(loc, type, 'value_loc')
    if (locBox) out.push(locBox)
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

function collectPlateTextCandidates(parsed) {
  const texts = []
  const kv = parsed?.prism_keyValueInfo || parsed?.prism_keyvalueinfo || []
  kv.forEach((item) => {
    const value = String(item.value || item.Value || '')
    if (value) texts.push(value)
  })
  const info = parsed?.info || parsed?.data?.info || []
  ;(info || []).forEach((item) => {
    const value = String(item.value || '')
    if (value) texts.push(value)
  })
  const nested = parsed?.data
  if (nested && typeof nested === 'object') {
    Object.values(nested).forEach((v) => {
      if (typeof v === 'string' && v) texts.push(v)
    })
  }
  return texts
}

function hasPlateTextInOcr(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  if (!parsed) return false
  return collectPlateTextCandidates(parsed).some((t) => PLATE_TEXT_RE.test(t.replace(/\s/g, '')))
}

function parsePlateBoxes(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  if (!parsed) return []
  const boxes = []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo
  boxes.push(
    ...boxesFromKeyValueInfo(kv, 'plate', (text, value, key) => {
      const merged = `${key}${value}${text}`
      return (
        key.includes('车牌') ||
        PLATE_TEXT_RE.test(String(value).replace(/\s/g, '')) ||
        PLATE_TEXT_RE.test(merged.replace(/\s/g, ''))
      )
    })
  )

  const structures = parsed.structure_list || parsed.structureList || []
  structures.forEach((item) => {
    const target = item && item.$ref ? parsed : item
    const pos = item?.pos || item?.valuePos || target?.valuePos
    const box = boxFromPoints(pos, 'plate', 'carNumber')
    if (box) boxes.push(box)
    const loc = item?.value_loc || item?.valueLoc
    const locBox = parseValueLocString(loc, 'plate', 'structure_loc')
    if (locBox) boxes.push(locBox)
  })

  const info = parsed.info || parsed.data?.info || []
  ;(info || []).forEach((item) => {
    const locBox = parseValueLocString(item.value_loc || item.valueLoc, 'plate', 'info_loc')
    if (locBox) boxes.push(locBox)
    const box = boxFromPoints(item.valuePos || item.value_pos, 'plate', 'info_pos')
    if (box) boxes.push(box)
  })

  if (parsed.plate_list) {
    parsed.plate_list.forEach((p) => {
      const roi = p.roi || p.Roi
      if (roi && Number.isFinite(roi.left ?? roi.X ?? roi.x)) {
        const left = roi.left ?? roi.X ?? roi.x
        const top = roi.top ?? roi.Y ?? roi.y
        const width = roi.width ?? roi.W ?? roi.w
        const height = roi.height ?? roi.H ?? roi.h
        const b = boxFromLtwh(left, top, width, height, 'plate', 'plate_list')
        if (b) boxes.push(b)
      }
      const posBox = boxFromPoints(p.positions || p.Positions, 'plate', 'plate_positions')
      if (posBox) boxes.push(posBox)
    })
  }

  return boxes
}

function parsePlateResult(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  const boxes = parsePlateBoxes(data)
  return {
    boxes,
    orgWidth: Number(parsed?.orgWidth || parsed?.width || 0),
    orgHeight: Number(parsed?.orgHeight || parsed?.height || 0),
    plateTextFound: hasPlateTextInOcr(data),
  }
}

function parseVinBoxes(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  if (!parsed) return []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo
  return boxesFromKeyValueInfo(kv, 'vin', (text, value) => VIN_RE.test(value) || VIN_RE.test(text))
}

function parseGeneralSensitiveBoxes(data) {
  const parsed = unwrapOcrRoot(safeParseData(data))
  if (!parsed) return []
  const boxes = []
  const kv = parsed.prism_keyValueInfo || parsed.prism_keyvalueinfo
  const words = parsed.prism_wordsInfo || parsed.prism_wordsinfo

  const phoneMatch = (text) => PHONE_RE.test(text.replace(/\s/g, ''))
  const vinMatch = (text) => VIN_RE.test(text)
  const docMatch = (text) => DOC_KEYWORDS.some((k) => text.includes(k))
  const plateMatch = (text) => PLATE_TEXT_RE.test(text.replace(/\s/g, ''))

  boxes.push(...boxesFromKeyValueInfo(kv, 'phone', (t, v) => phoneMatch(v) || phoneMatch(t)))
  boxes.push(...boxesFromKeyValueInfo(kv, 'vin', (t, v) => vinMatch(v) || vinMatch(t)))
  boxes.push(...boxesFromKeyValueInfo(kv, 'document', (t, v) => docMatch(v) || docMatch(t)))
  boxes.push(...boxesFromKeyValueInfo(kv, 'plate', (t, v) => plateMatch(v) || plateMatch(t)))

  boxes.push(...boxesFromWordsInfo(words, 'phone', (w) => phoneMatch(w)))
  boxes.push(...boxesFromWordsInfo(words, 'vin', (w) => vinMatch(w)))
  boxes.push(...boxesFromWordsInfo(words, 'document', (w) => docMatch(w)))
  boxes.push(...boxesFromWordsInfo(words, 'plate', (w) => plateMatch(w)))

  return boxes
}

module.exports = {
  parsePlateBoxes,
  parsePlateResult,
  parseVinBoxes,
  parseGeneralSensitiveBoxes,
  hasPlateTextInOcr,
  safeParseData,
}
