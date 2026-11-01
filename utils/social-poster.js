/**
 * 把配文和照片排进一张图。朋友圈、小红书、抖音版式不同。
 * 不依赖小程序接口，绘制时传入 canvas 上下文。
 */

const POSTER_WIDTH = 1080
const MASK_NOTE = '车牌已打码'

function wrapLines(ctx, text, maxWidth, font) {
  ctx.font = font
  const lines = []
  String(text || '')
    .split('\n')
    .forEach((para) => {
      const value = para.trim()
      if (!value) return
      let current = ''
      for (const ch of value) {
        const next = current + ch
        if (current && ctx.measureText(next).width > maxWidth) {
          lines.push(current)
          current = ch
        } else {
          current = next
        }
      }
      if (current) lines.push(current)
    })
  return lines
}

function splitTitleBody(text) {
  const rows = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    title: rows[0] || '',
    body: rows.slice(1).join('\n'),
  }
}

function coverSource(img, frameW, frameH) {
  const iw = img.width || img.img.width || 1
  const ih = img.height || img.img.height || 1
  const frameRatio = frameW / frameH
  const imageRatio = iw / ih
  if (imageRatio > frameRatio) {
    const sw = ih * frameRatio
    return { sx: (iw - sw) / 2, sy: 0, sw, sh: ih }
  }
  const sh = iw / frameRatio
  return { sx: 0, sy: (ih - sh) / 2, sw: iw, sh }
}

function pushImage(ops, img, x, y, w, h) {
  ops.push({ type: 'image', img: img.img || img, src: coverSource(img, w, h), x, y, w, h })
}

function pushText(ops, lines, x, y, lineHeight, font, color) {
  lines.forEach((line, index) => {
    ops.push({
      type: 'text',
      text: line,
      x,
      y: y + index * lineHeight,
      font,
      color,
    })
  })
  return lines.length * lineHeight
}

function momentsGrid(count, innerW) {
  if (!count) return { cols: 1, cell: 0, rows: 0, gap: 16, height: 0, singleH: 0 }
  const gap = 16
  const cols = count <= 1 ? 1 : count === 2 || count === 4 ? 2 : 3
  const cell = count <= 1 ? innerW : Math.floor((innerW - gap * (cols - 1)) / cols)
  const rows = Math.max(1, Math.ceil(count / cols))
  const height = count <= 1 ? Math.round(innerW * 0.75) : rows * cell + (rows - 1) * gap
  return { cols, cell, rows, gap, height, singleH: Math.round(innerW * 0.75) }
}

function planMoments(ctx, text, images, width) {
  const pad = 72
  const inner = width - pad * 2
  const ops = []
  let y = pad
  const font = '44px sans-serif'
  const lines = wrapLines(ctx, text, inner, font).slice(0, 8)
  const textH = pushText(ops, lines, pad, y, 68, font, '#1f2329')
  y += textH + (lines.length ? 40 : 0)
  const grid = momentsGrid(images.length, inner)
  images.forEach((img, index) => {
    if (images.length === 1) {
      pushImage(ops, img, pad, y, inner, grid.singleH)
      return
    }
    const col = index % grid.cols
    const row = Math.floor(index / grid.cols)
    const x = pad + col * (grid.cell + grid.gap)
    const iy = y + row * (grid.cell + grid.gap)
    pushImage(ops, img, x, iy, grid.cell, grid.cell)
  })
  y += grid.height + 36
  pushText(ops, [MASK_NOTE], pad, y, 40, '28px sans-serif', '#8f959e')
  y += 40 + pad
  return { width, height: y, background: '#ffffff', ops }
}

function planXiaohongshu(ctx, text, images, width, caption) {
  const ops = []
  const parts = splitTitleBody(text)
  const bodySource = String(caption || '').trim() || parts.body
  const coverH = images.length ? 1440 : 0
  if (images.length) {
    pushImage(ops, images[0], 0, 0, width, coverH)
    ops.push({
      type: 'shade',
      x: 0,
      y: coverH - 460,
      w: width,
      h: 460,
    })
    const titleLines = wrapLines(ctx, parts.title, width - 112, '600 60px sans-serif').slice(0, 2)
    const titleTop = coverH - 56 - titleLines.length * 78
    pushText(ops, titleLines, 56, titleTop, 78, '600 60px sans-serif', '#ffffff')
  }
  let y = coverH + 56
  const bodyFont = '40px sans-serif'
  const bodyLines = wrapLines(ctx, bodySource || parts.title, width - 112, bodyFont).slice(0, 8)
  y += pushText(ops, bodyLines, 56, y, 64, bodyFont, '#1f2329')
  y += bodyLines.length ? 40 : 0
  const rest = images.slice(1, 5)
  rest.forEach((img) => {
    const h = 860
    if (y + h > 4200) return
    pushImage(ops, img, 56, y, width - 112, h)
    y += h + 24
  })
  y += 12
  pushText(ops, [MASK_NOTE], 56, y, 40, '28px sans-serif', '#8f959e')
  y += 40 + 64
  return { width, height: y, background: '#ffffff', ops }
}

function planDouyin(ctx, text, images, width) {
  const height = 1920
  const ops = []
  if (images.length === 1) {
    pushImage(ops, images[0], 0, 0, width, height)
  } else if (images.length) {
    const stripH = 420
    const mainH = height - stripH
    pushImage(ops, images[0], 0, stripH, width, mainH)
    const thumbs = images.slice(1, 4)
    const gap = 8
    const tw = Math.floor((width - gap * (thumbs.length - 1)) / thumbs.length)
    thumbs.forEach((img, index) => {
      pushImage(ops, img, index * (tw + gap), 0, tw, stripH)
    })
  } else {
    ops.push({ type: 'fill', x: 0, y: 0, w: width, h: height, color: '#141414' })
  }
  ops.push({ type: 'shade', x: 0, y: height - 760, w: width, h: 760 })
  const lines = wrapLines(ctx, text, width - 120, '600 52px sans-serif').slice(0, 4)
  const blockH = lines.length * 74
  pushText(ops, lines, 60, height - 120 - blockH, 74, '600 52px sans-serif', '#ffffff')
  pushText(ops, [MASK_NOTE], 60, height - 88, 36, '26px sans-serif', 'rgba(255,255,255,0.78)')
  return { width, height, background: '#141414', ops }
}

function momentsKeep(count) {
  const allowed = [9, 6, 4, 3, 1]
  const n = Number(count) || 0
  if (allowed.includes(n)) return n
  return allowed.find((size) => size < n) || 0
}

function planFrame(ctx, options = {}) {
  const platform = options.platform || 'moments'
  const width = options.width || POSTER_WIDTH
  const image = options.image
  const line = String(options.line || '').trim()
  if (platform === 'moments') {
    const ops = []
    if (image) pushImage(ops, image, 0, 0, width, width)
    else ops.push({ type: 'fill', x: 0, y: 0, w: width, h: width, color: '#f5f6f7' })
    return { width, height: width, background: '#ffffff', ops }
  }
  const height = platform === 'douyin' ? 1920 : 1440
  const ops = []
  if (image) pushImage(ops, image, 0, 0, width, height)
  else ops.push({ type: 'fill', x: 0, y: 0, w: width, h: height, color: '#141414' })
  if (line) {
    ops.push({ type: 'shade', x: 0, y: height - 420, w: width, h: 420 })
    const font = '600 64px sans-serif'
    const lines = wrapLines(ctx, line, width - 120, font).slice(0, 2)
    const top = height - 96 - lines.length * 84
    pushText(ops, lines, 60, top, 84, font, '#ffffff')
  }
  return { width, height, background: '#141414', ops }
}

function planPoster(ctx, options = {}) {
  const platform = options.platform || 'moments'
  const width = options.width || POSTER_WIDTH
  const text = String(options.text || '').trim()
  const images = Array.isArray(options.images) ? options.images.filter(Boolean) : []
  if (platform === 'xiaohongshu') return planXiaohongshu(ctx, text, images, width, options.caption)
  if (platform === 'douyin') return planDouyin(ctx, text, images, width)
  return planMoments(ctx, text, images, width)
}

function paintPoster(ctx, plan) {
  ctx.textBaseline = 'top'
  ctx.fillStyle = plan.background || '#ffffff'
  ctx.fillRect(0, 0, plan.width, plan.height)
  ;(plan.ops || []).forEach((op) => {
    if (op.type === 'fill') {
      ctx.fillStyle = op.color
      ctx.fillRect(op.x, op.y, op.w, op.h)
      return
    }
    if (op.type === 'shade') {
      const gradient = ctx.createLinearGradient(0, op.y, 0, op.y + op.h)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(1, 'rgba(0,0,0,0.72)')
      ctx.fillStyle = gradient
      ctx.fillRect(op.x, op.y, op.w, op.h)
      return
    }
    if (op.type === 'text') {
      ctx.font = op.font
      ctx.fillStyle = op.color
      ctx.fillText(op.text, op.x, op.y)
      return
    }
    if (op.type === 'image' && op.img) {
      const src = op.src || { sx: 0, sy: 0, sw: op.img.width, sh: op.img.height }
      ctx.drawImage(op.img, src.sx, src.sy, src.sw, src.sh, op.x, op.y, op.w, op.h)
    }
  })
}

module.exports = {
  POSTER_WIDTH,
  MASK_NOTE,
  planPoster,
  planFrame,
  paintPoster,
  momentsGrid,
  momentsKeep,
}
