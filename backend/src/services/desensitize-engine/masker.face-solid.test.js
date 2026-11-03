const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const sharp = require('sharp')
const { applyMosaicToImage, resolveBoxEffect } = require('./masker')

test('face/plate/vin resolve to solid fill', () => {
  assert.equal(resolveBoxEffect({ type: 'face' }), 'solid')
  assert.equal(resolveBoxEffect({ type: 'plate' }), 'solid')
  assert.equal(resolveBoxEffect({ type: 'vin' }), 'solid')
  assert.equal(resolveBoxEffect({ type: 'custom' }, 'mosaic'), 'mosaic')
})

test('face box paints solid gray (not a no-op mosaic)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masker-face-'))
  const src = path.join(dir, 'src.jpg')
  // 渐变底，避免整图纯色难判断
  const w = 200
  const h = 200
  const raw = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3
      raw[i] = x
      raw[i + 1] = y
      raw[i + 2] = 120
    }
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toFile(src)

  const out = await applyMosaicToImage(
    src,
    [{ type: 'face', left: 40, top: 40, width: 80, height: 80 }],
    'mosaic',
  )
  const before = await sharp(src).raw().toBuffer({ resolveWithObject: true })
  const after = await sharp(out).raw().toBuffer({ resolveWithObject: true })
  let changed = 0
  let nearGray = 0
  const x0 = 40
  const y0 = 40
  for (let y = y0; y < y0 + 80; y += 1) {
    for (let x = x0; x < x0 + 80; x += 1) {
      const i = (y * w + x) * 3
      const dr = Math.abs(before.data[i] - after.data[i])
      const dg = Math.abs(before.data[i + 1] - after.data[i + 1])
      const db = Math.abs(before.data[i + 2] - after.data[i + 2])
      if (dr + dg + db > 30) changed += 1
      if (
        Math.abs(after.data[i] - 72) < 20 &&
        Math.abs(after.data[i + 1] - 72) < 20 &&
        Math.abs(after.data[i + 2] - 72) < 20
      ) {
        nearGray += 1
      }
    }
  }
  assert.ok(changed > 80 * 80 * 0.8, `face region should change, got ${changed}`)
  assert.ok(nearGray > 80 * 80 * 0.7, `face region should be solid gray, got ${nearGray}`)
  fs.rmSync(dir, { recursive: true, force: true })
})
