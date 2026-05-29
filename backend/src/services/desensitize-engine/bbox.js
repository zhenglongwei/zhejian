const PADDING_RATIO = 0.08

/**
 * @typedef {{ left: number, top: number, width: number, height: number, type: string, source?: string }} BBox
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function boxFromLtwh(left, top, width, height, type, source = '') {
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height, type, source }
}

/** 四顶点 [{x,y},...] → 外接矩形 */
function boxFromPoints(points, type, source = '') {
  if (!Array.isArray(points) || points.length < 2) return null
  const xs = points.map((p) => Number(p.x ?? p.X)).filter(Number.isFinite)
  const ys = points.map((p) => Number(p.y ?? p.Y)).filter(Number.isFinite)
  if (!xs.length || !ys.length) return null
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return boxFromLtwh(left, top, right - left, bottom - top, type, source)
}

/** DetectFace FaceRectangles: [left, top, width, height, ...] */
function boxesFromFaceRectangles(flat, type = 'face') {
  const out = []
  if (!Array.isArray(flat)) return out
  for (let i = 0; i + 3 < flat.length; i += 4) {
    const box = boxFromLtwh(flat[i], flat[i + 1], flat[i + 2], flat[i + 3], type, 'detectFace')
    if (box) out.push(box)
  }
  return out
}

function padBox(box, imageWidth, imageHeight) {
  const padX = Math.round(box.width * PADDING_RATIO)
  const padY = Math.round(box.height * PADDING_RATIO)
  const left = clamp(Math.floor(box.left - padX), 0, Math.max(0, imageWidth - 1))
  const top = clamp(Math.floor(box.top - padY), 0, Math.max(0, imageHeight - 1))
  const right = clamp(Math.ceil(box.left + box.width + padX), 0, imageWidth)
  const bottom = clamp(Math.ceil(box.top + box.height + padY), 0, imageHeight)
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  return { ...box, left, top, width, height }
}

function overlapArea(a, b) {
  const x1 = Math.max(a.left, b.left)
  const y1 = Math.max(a.top, b.top)
  const x2 = Math.min(a.left + a.width, b.left + b.width)
  const y2 = Math.min(a.top + a.height, b.top + b.height)
  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

function mergeBoxes(boxes, imageWidth, imageHeight) {
  const merged = boxes
    .map((b) => padBox(b, imageWidth, imageHeight))
    .filter((b) => b.width > 0 && b.height > 0)

  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const a = merged[i]
        const b = merged[j]
        const minArea = Math.min(a.width * a.height, b.width * b.height)
        if (minArea > 0 && overlapArea(a, b) / minArea > 0.35) {
          const left = Math.min(a.left, b.left)
          const top = Math.min(a.top, b.top)
          const right = Math.max(a.left + a.width, b.left + b.width)
          const bottom = Math.max(a.top + a.height, b.top + b.height)
          merged[i] = {
            left,
            top,
            width: right - left,
            height: bottom - top,
            type: a.type === b.type ? a.type : 'mixed',
            source: [a.source, b.source].filter(Boolean).join('+'),
          }
          merged.splice(j, 1)
          changed = true
          break outer
        }
      }
    }
  }
  return merged
}

module.exports = {
  boxFromLtwh,
  boxFromPoints,
  boxesFromFaceRectangles,
  padBox,
  mergeBoxes,
}
