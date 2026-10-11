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
  return { px, stroke, circle, fillCircle, roundRect }
}

const SIZE = 96
const C = {
  gray: [113, 128, 150, 255],
  ink: [31, 35, 41, 255],
  blue: [18, 105, 242, 255],
  white: [255, 255, 255, 255],
  amber: [182, 107, 0, 255],
  green: [20, 168, 121, 255],
}

function drawHome(color) {
  const g = canvas(SIZE)
  const s = 6
  g.stroke(48, 16, 16, 42, color, s)
  g.stroke(48, 16, 80, 42, color, s)
  g.stroke(24, 38, 24, 78, color, s)
  g.stroke(72, 38, 72, 78, color, s)
  g.stroke(24, 78, 38, 78, color, s)
  g.stroke(58, 78, 72, 78, color, s)
  g.stroke(38, 78, 38, 54, color, s)
  g.stroke(58, 54, 58, 78, color, s)
  g.stroke(38, 54, 58, 54, color, s)
  return g.px
}

function drawAlbum(color) {
  const g = canvas(SIZE)
  g.stroke(22, 24, 74, 24, color, 6)
  g.stroke(22, 72, 74, 72, color, 6)
  g.stroke(22, 24, 22, 72, color, 6)
  g.stroke(74, 24, 74, 72, color, 6)
  g.circle(36, 40, 6, color, 4.5)
  g.stroke(28, 64, 44, 50, color, 5)
  g.stroke(44, 50, 70, 64, color, 5)
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

function drawStore(color) {
  const g = canvas(SIZE)
  g.stroke(18, 40, 78, 40, color, 6)
  g.stroke(22, 40, 28, 22, color, 6)
  g.stroke(74, 22, 68, 40, color, 6)
  g.stroke(28, 22, 74, 22, color, 6)
  g.stroke(26, 40, 26, 78, color, 6)
  g.stroke(70, 40, 70, 78, color, 6)
  g.stroke(26, 78, 70, 78, color, 6)
  g.stroke(40, 78, 40, 54, color, 6)
  g.stroke(56, 78, 56, 54, color, 6)
  g.stroke(40, 54, 56, 54, color, 6)
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

function drawPencil(color) {
  const g = canvas(SIZE)
  g.stroke(30, 68, 72, 26, color, 6)
  g.stroke(20, 78, 34, 66, color, 4)
  g.stroke(20, 78, 28, 60, color, 4)
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

const outDir = path.join(__dirname, '..', 'assets', 'mch')
fs.mkdirSync(outDir, { recursive: true })

const files = {
  'tab-home.png': drawHome(C.gray),
  'tab-home-on.png': drawHome(C.blue),
  'tab-albums.png': drawAlbum(C.gray),
  'tab-albums-on.png': drawAlbum(C.blue),
  'tab-ai.png': drawSpark(C.gray),
  'tab-ai-on.png': drawSpark(C.blue),
  'tab-store.png': drawStore(C.gray),
  'tab-store-on.png': drawStore(C.blue),
  'car-white.png': drawCar(C.white),
  'car-blue.png': drawCar(C.blue),
  'clock-amber.png': drawClock(C.amber),
  'check-green.png': drawCheck(C.green),
  'check-blue.png': drawCheck(C.blue),
  'check-white.png': drawCheck(C.white),
  'clock-gray.png': drawClock(C.gray),
  'doc-blue.png': drawDoc(C.blue),
  'camera-gray.png': drawCamera(C.gray),
  'phone-ink.png': drawPhone(C.ink),
  'plus-white.png': drawPlus(C.white),
  'spark-white.png': drawSpark(C.white),
  'pencil-blue.png': drawPencil(C.blue),
  'pencil-white.png': drawPencil(C.white),
  'scan-blue.png': drawScan(C.blue),
  'pin-white.png': drawPin(C.white),
  'eye-blue.png': drawEye(C.blue),
  'person-blue.png': drawPerson(C.blue),
}

Object.entries(files).forEach(([name, rgba]) => {
  fs.writeFileSync(path.join(outDir, name), toPng(SIZE, rgba))
})

console.log(`wrote ${Object.keys(files).length} icons to ${outDir}`)
