/**
 * 商家工作台线框图标。微信小程序不渲染 WXSS mask / SVG，
 * 所以落成透明 PNG，给 <image> 用。
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type)
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function toPng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function canvas(size) {
  const px = Buffer.alloc(size * size * 4)
  const put = (x, y, color, alpha = 1) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return
    const i = (iy * size + ix) * 4
    const a = Math.max(0, Math.min(1, alpha))
    const srcA = (color[3] ?? 255) / 255 * a
    const dstA = px[i + 3] / 255
    const outA = srcA + dstA * (1 - srcA)
    if (outA <= 0) return
    px[i] = Math.round((color[0] * srcA + px[i] * dstA * (1 - srcA)) / outA)
    px[i + 1] = Math.round((color[1] * srcA + px[i + 1] * dstA * (1 - srcA)) / outA)
    px[i + 2] = Math.round((color[2] * srcA + px[i + 2] * dstA * (1 - srcA)) / outA)
    px[i + 3] = Math.round(outA * 255)
  }
  const stroke = (x1, y1, x2, y2, color, width) => {
    const pad = width + 1
    const minX = Math.floor(Math.min(x1, x2) - pad)
    const maxX = Math.ceil(Math.max(x1, x2) + pad)
    const minY = Math.floor(Math.min(y1, y2) - pad)
    const maxY = Math.ceil(Math.max(y1, y2) + pad)
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy || 1
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        let t = ((x - x1) * dx + (y - y1) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        const dist = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
        const half = width / 2
        if (dist <= half) put(x, y, color, 1)
        else if (dist < half + 1) put(x, y, color, half + 1 - dist)
      }
    }
  }
  const circle = (cx, cy, r, color, width) => {
    const pad = width + 1
    for (let y = Math.floor(cy - r - pad); y <= cy + r + pad; y += 1) {
      for (let x = Math.floor(cx - r - pad); x <= cx + r + pad; x += 1) {
        const dist = Math.abs(Math.hypot(x - cx, y - cy) - r)
        const half = width / 2
        if (dist <= half) put(x, y, color, 1)
        else if (dist < half + 1) put(x, y, color, half + 1 - dist)
      }
    }
  }
  const fillCircle = (cx, cy, r, color) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
        const dist = Math.hypot(x - cx, y - cy)
        if (dist <= r) put(x, y, color, 1)
        else if (dist < r + 1) put(x, y, color, r + 1 - dist)
      }
    }
  }
  const roundRect = (x, y, w, h, r, color, width) => {
    stroke(x + r, y, x + w - r, y, color, width)
    stroke(x + r, y + h, x + w - r, y + h, color, width)
    stroke(x, y + r, x, y + h - r, color, width)
    stroke(x + w, y + r, x + w, y + h - r, color, width)
    const cap = Math.max(width, r)
    circle(x + r, y + r, r, color, width > r ? width : Math.max(width, 2.2))
    circle(x + w - r, y + r, r, color, width)
    circle(x + r, y + h - r, r, color, width)
    circle(x + w - r, y + h - r, r, color, width)
    void cap
  }
  const fillPoly = (pts, color) => {
    const inside = (x, y) => {
      let hit = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]
        const [xj, yj] = pts[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    }
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let cov = 0
        for (let sy = 0; sy < 3; sy += 1) {
          for (let sx = 0; sx < 3; sx += 1) {
            if (inside(x + sx / 3 + 1 / 6, y + sy / 3 + 1 / 6)) cov += 1
          }
        }
        if (cov > 0) put(x, y, color, cov / 9)
      }
    }
  }
  const fillRoundRect = (x0, y0, w, h, r, color) => {
    const x1 = x0 + w - 1
    const y1 = y0 + h - 1
    const inside = (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return false
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
      const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
      return dx * dx + dy * dy <= r * r
    }
    for (let y = Math.floor(y0) - 1; y <= y1 + 1; y += 1) {
      for (let x = Math.floor(x0) - 1; x <= x1 + 1; x += 1) {
        let cov = 0
        for (let sy = 0; sy < 3; sy += 1) {
          for (let sx = 0; sx < 3; sx += 1) {
            if (inside(x + sx / 3 + 1 / 6, y + sy / 3 + 1 / 6)) cov += 1
          }
        }
        if (cov > 0) put(x, y, color, cov / 9)
      }
    }
  }
  return { px, stroke, circle, fillCircle, roundRect, fillPoly, fillRoundRect }
}

const SIZE = 96
const C = {
  gray: [113, 128, 150, 255],
  ink: [31, 35, 41, 255],
  blue: [18, 105, 242, 255],
  white: [255, 255, 255, 255],
  green: [20, 168, 121, 255],
  warning: [255, 125, 0, 255],
  faint: [209, 213, 219, 255],
}

/** 工作台=仪表盘：上半圆弧 + 指针 + 轴心；filled 时加粗为选中态 */
function drawHome(color, filled) {
  const g = canvas(SIZE)
  const cx = 48
  const cy = 70
  const r = 30
  const w = filled ? 9 : 6
  let prev = null
  for (let i = 0; i <= 30; i += 1) {
    const a = Math.PI - (i * Math.PI) / 30
    const p = [cx + r * Math.cos(a), cy - r * Math.sin(a)]
    if (prev) g.stroke(prev[0], prev[1], p[0], p[1], color, w)
    prev = p
  }
  g.stroke(cx, cy, 60, 48, color, filled ? 8 : 5)
  g.fillCircle(cx, cy, filled ? 7 : 4.5, color)
  return g.px
}

/** 服务相册=叠放卡片：后卡露出边 + 前卡(山形)；filled 时前卡实心反白 */
function drawAlbum(color, filled) {
  const g = canvas(SIZE)
  const s = 6
  g.stroke(26, 18, 78, 18, color, s)
  g.stroke(78, 18, 78, 54, color, s)
  g.stroke(26, 18, 26, 34, color, s)
  g.stroke(68, 54, 78, 54, color, s)
  const mtn = [[23, 61], [34, 50], [42, 57], [48, 52], [55, 60]]
  if (filled) {
    g.fillRoundRect(16, 34, 53, 37, 8, color)
    for (let i = 1; i < mtn.length; i += 1) g.stroke(mtn[i - 1][0], mtn[i - 1][1], mtn[i][0], mtn[i][1], C.white, 5)
  } else {
    g.roundRect(16, 34, 52, 36, 8, color, 6)
    for (let i = 1; i < mtn.length; i += 1) g.stroke(mtn[i - 1][0], mtn[i - 1][1], mtn[i][0], mtn[i][1], color, 5)
  }
  return g.px
}

function star(g, cx, cy, r, color, width) {
  const pts = []
  for (let i = 0; i < 8; i += 1) {
    const rad = -Math.PI / 2 + (i * Math.PI) / 4
    const len = i % 2 === 0 ? r : r * 0.38
    pts.push([cx + Math.cos(rad) * len, cy + Math.sin(rad) * len])
  }
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    g.stroke(a[0], a[1], b[0], b[1], color, width)
  }
}

function drawSpark(color) {
  const g = canvas(SIZE)
  star(g, 42, 46, 28, color, 5)
  star(g, 72, 22, 12, color, 4)
  return g.px
}

/** 门店=遮阳篷店面：梯形篷 + 扇贝齿 + 门体 + 门；filled 时篷/体实心、门反白 */
function drawStore(color, filled) {
  const g = canvas(SIZE)
  const awn = [[18, 36], [25, 18], [71, 18], [78, 36]]
  const ticks = [18, 39, 57, 78]
  if (filled) {
    g.fillPoly(awn, color)
    g.fillRoundRect(24, 46, 49, 35, 6, color)
    for (const tx of ticks) g.stroke(tx, 36, tx, 43, color, 6)
    g.fillRoundRect(40, 62, 17, 19, 3, C.white)
  } else {
    g.stroke(18, 36, 25, 18, color, 6)
    g.stroke(25, 18, 71, 18, color, 6)
    g.stroke(71, 18, 78, 36, color, 6)
    for (const tx of ticks) g.stroke(tx, 36, tx, 42, color, 5)
    g.stroke(24, 46, 24, 80, color, 6)
    g.stroke(24, 80, 72, 80, color, 6)
    g.stroke(72, 46, 72, 80, color, 6)
    g.stroke(40, 80, 40, 62, color, 5)
    g.stroke(40, 62, 56, 62, color, 5)
    g.stroke(56, 62, 56, 80, color, 5)
  }
  return g.px
}

function drawCar(color) {
  const g = canvas(SIZE)
  g.stroke(18, 52, 30, 36, color, 6)
  g.stroke(30, 36, 58, 34, color, 6)
  g.stroke(58, 34, 72, 48, color, 6)
  g.stroke(16, 54, 80, 54, color, 6)
  g.stroke(16, 54, 16, 66, color, 6)
  g.stroke(80, 54, 80, 66, color, 6)
  g.stroke(16, 66, 80, 66, color, 6)
  g.circle(30, 70, 8, color, 5)
  g.circle(66, 70, 8, color, 5)
  return g.px
}

function drawClock(color) {
  const g = canvas(SIZE)
  g.circle(48, 48, 28, color, 6)
  g.stroke(48, 48, 48, 30, color, 6)
  g.stroke(48, 48, 64, 54, color, 6)
  return g.px
}

function drawScan(color) {
  const g = canvas(SIZE)
  const w = 5
  g.stroke(22, 36, 22, 22, color, w)
  g.stroke(22, 22, 36, 22, color, w)
  g.stroke(60, 22, 74, 22, color, w)
  g.stroke(74, 22, 74, 36, color, w)
  g.stroke(22, 60, 22, 74, color, w)
  g.stroke(22, 74, 36, 74, color, w)
  g.stroke(60, 74, 74, 74, color, w)
  g.stroke(74, 60, 74, 74, color, w)
  g.stroke(30, 48, 66, 48, color, 4)
  return g.px
}

function drawPin(color) {
  const g = canvas(SIZE)
  g.circle(48, 36, 16, color, 4)
  g.circle(48, 36, 5, color, 4)
  g.stroke(48, 52, 48, 74, color, 4)
  return g.px
}

function drawEye(color) {
  const g = canvas(SIZE)
  g.stroke(16, 48, 32, 34, color, 6)
  g.stroke(32, 34, 64, 34, color, 6)
  g.stroke(64, 34, 80, 48, color, 6)
  g.stroke(16, 48, 32, 62, color, 6)
  g.stroke(32, 62, 64, 62, color, 6)
  g.stroke(64, 62, 80, 48, color, 6)
  g.circle(48, 48, 8, color, 5)
  return g.px
}

function drawPerson(color) {
  const g = canvas(SIZE)
  g.circle(48, 30, 12, color, 6)
  g.stroke(24, 74, 36, 52, color, 6)
  g.stroke(72, 74, 60, 52, color, 6)
  g.stroke(36, 52, 60, 52, color, 6)
  return g.px
}

function drawCheck(color) {
  const g = canvas(SIZE)
  g.stroke(22, 50, 40, 68, color, 8)
  g.stroke(40, 68, 76, 28, color, 8)
  return g.px
}

function drawDoc(color) {
  const g = canvas(SIZE)
  g.roundRect(26, 16, 44, 64, 6, color, 5)
  g.stroke(36, 36, 60, 36, color, 4)
  g.stroke(36, 50, 60, 50, color, 4)
  g.stroke(36, 64, 52, 64, color, 4)
  return g.px
}

function drawCamera(color) {
  const g = canvas(SIZE)
  g.roundRect(16, 32, 64, 44, 8, color, 5)
  g.stroke(34, 32, 40, 22, color, 5)
  g.stroke(40, 22, 58, 22, color, 5)
  g.stroke(58, 22, 64, 32, color, 5)
  g.circle(48, 54, 12, color, 5)
  return g.px
}

function drawPhone(color) {
  const g = canvas(SIZE)
  g.stroke(28, 62, 40, 50, color, 6)
  g.stroke(40, 50, 46, 56, color, 6)
  g.stroke(46, 56, 62, 40, color, 6)
  g.stroke(62, 40, 70, 28, color, 6)
  g.stroke(22, 68, 34, 68, color, 6)
  g.stroke(64, 22, 74, 22, color, 6)
  return g.px
}

function drawPlus(color) {
  const g = canvas(SIZE)
  g.stroke(48, 22, 48, 74, color, 8)
  g.stroke(22, 48, 74, 48, color, 8)
  return g.px
}

function drawClose(color) {
  const g = canvas(SIZE)
  g.stroke(28, 28, 68, 68, color, 8)
  g.stroke(68, 28, 28, 68, color, 8)
  return g.px
}

function drawChevronRight(color) {
  const g = canvas(SIZE)
  g.stroke(38, 26, 58, 48, color, 7)
  g.stroke(58, 48, 38, 70, color, 7)
  return g.px
}

function drawChevronLeft(color) {
  const g = canvas(SIZE)
  g.stroke(58, 26, 38, 48, color, 7)
  g.stroke(38, 48, 58, 70, color, 7)
  return g.px
}

function drawChevronDown(color) {
  const g = canvas(SIZE)
  g.stroke(26, 38, 48, 58, color, 7)
  g.stroke(48, 58, 70, 38, color, 7)
  return g.px
}

/** 放大镜：圆环 + 45° 手柄 */
function drawSearch(color) {
  const g = canvas(SIZE)
  g.circle(42, 42, 20, color, 6)
  g.stroke(57, 57, 74, 74, color, 7)
  return g.px
}

/** 实心五角星：像素级 3×3 超采样点在多边形内判定（stroke 画不了填充形） */
function drawStar(color) {
  const px = Buffer.alloc(SIZE * SIZE * 4)
  const cx = 48
  const cy = 49
  const outer = 27
  const inner = 11.5
  const pts = []
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  const inside = (x, y) => {
    let hit = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let cov = 0
      for (let sy = 0; sy < 3; sy += 1) {
        for (let sx = 0; sx < 3; sx += 1) {
          if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) cov += 1
        }
      }
      if (!cov) continue
      const i = (y * SIZE + x) * 4
      px[i] = color[0]
      px[i + 1] = color[1]
      px[i + 2] = color[2]
      px[i + 3] = Math.round((cov / 9) * 255)
    }
  }
  return px
}

const outDir = path.join(__dirname, '..', 'assets', 'mch')
fs.mkdirSync(outDir, { recursive: true })

const files = {
  'tab-home.png': drawHome(C.gray, false),
  'tab-home-on.png': drawHome(C.blue, true),
  'tab-albums.png': drawAlbum(C.gray, false),
  'tab-albums-on.png': drawAlbum(C.blue, true),
  'tab-ai.png': drawSpark(C.gray),
  'tab-ai-on.png': drawSpark(C.blue),
  'tab-store.png': drawStore(C.gray, false),
  'tab-store-on.png': drawStore(C.blue, true),
  'car-white.png': drawCar(C.white),
  'car-blue.png': drawCar(C.blue),
  'check-green.png': drawCheck(C.green),
  'check-blue.png': drawCheck(C.blue),
  'check-white.png': drawCheck(C.white),
  'clock-gray.png': drawClock(C.gray),
  'doc-blue.png': drawDoc(C.blue),
  'camera-gray.png': drawCamera(C.gray),
  'phone-ink.png': drawPhone(C.ink),
  'plus-white.png': drawPlus(C.white),
  'plus-blue.png': drawPlus(C.blue),
  'plus-gray.png': drawPlus(C.gray),
  'spark-white.png': drawSpark(C.white),
  'scan-blue.png': drawScan(C.blue),
  'pin-blue.png': drawPin(C.blue),
  'eye-blue.png': drawEye(C.blue),
  'person-blue.png': drawPerson(C.blue),
  'close-gray.png': drawClose(C.gray),
  'search-gray.png': drawSearch(C.gray),
  'close-ink.png': drawClose(C.ink),
  'close-white.png': drawClose(C.white),
  'chevron-right-gray.png': drawChevronRight(C.gray),
  'chevron-right-blue.png': drawChevronRight(C.blue),
  'chevron-left-ink.png': drawChevronLeft(C.ink),
  'chevron-left-white.png': drawChevronLeft(C.white),
  'chevron-down-gray.png': drawChevronDown(C.gray),
  'chevron-down-blue.png': drawChevronDown(C.blue),
  'star-warning.png': drawStar(C.warning),
  'star-faint.png': drawStar(C.faint),
}

Object.entries(files).forEach(([name, rgba]) => {
  fs.writeFileSync(path.join(outDir, name), toPng(SIZE, rgba))
})

console.log(`wrote ${Object.keys(files).length} icons to ${outDir}`)
