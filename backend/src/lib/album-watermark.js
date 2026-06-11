/**
 * B-MEDIA-06：服务相册保存时叠加证据链轻量水印（右下角 SVG）
 */
const fs = require('fs')
const { formatVehicle } = require('./ids')
const {
  parseObjectKeyFromPublicUrl,
  resolveMediaFilePathFromPublicUrl,
  rewriteMediaUrlForCurrentBase,
} = require('./media-storage')
const { loadSharp } = require('./image-process')

function formatWatermarkTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildWatermarkLines(album, nodeTitle = '') {
  const storeName = String(album?.storeName || '门店').slice(0, 24)
  const vehicle = formatVehicle(album?.vehicleJson).slice(0, 28)
  const node = String(nodeTitle || '服务节点').slice(0, 24)
  const albumShort = String(album?.id || '').slice(-8)
  const time = formatWatermarkTime(node?.updatedAt || album?.updatedAt || new Date())
  return [
    `辙见 · ${storeName}`,
    vehicle !== '—' ? vehicle : '',
    `${node} · ${time}`,
    albumShort ? `相册 ${albumShort}` : '',
  ].filter(Boolean)
}

function escapeSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {string} filePath 本地绝对路径
 * @param {string[]} lines
 * @param {{ opacity?: number }} options
 */
async function applyBusinessWatermark(filePath, lines = [], options = {}) {
  const sharp = loadSharp()
  if (!sharp || !filePath || !fs.existsSync(filePath) || !lines.length) {
    return { applied: false }
  }

  const opacity = options.opacity ?? 0.28
  const meta = await sharp(filePath).metadata()
  const width = meta.width || 800
  const height = meta.height || 600
  const fontSize = Math.max(12, Math.floor(Math.min(width, height) / 36))
  const lineHeight = Math.round(fontSize * 1.35)
  const padding = Math.max(8, Math.floor(fontSize * 0.6))
  const textLines = lines.slice(0, 4)
  const blockHeight = textLines.length * lineHeight + padding * 2
  const blockWidth = Math.min(width - padding * 2, Math.max(180, width * 0.55))
  const x = width - blockWidth - padding
  const y = height - blockHeight - padding

  const tspans = textLines
    .map((line, i) => {
      const dy = i === 0 ? fontSize + padding : lineHeight
      return `<tspan x="${x + padding}" dy="${dy}">${escapeSvgText(line)}</tspan>`
    })
    .join('')

  const textFill = Math.min(0.95, opacity + 0.55)
  const rectFill = Math.min(0.45, opacity + 0.12)

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">
      <rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" rx="6" fill="rgba(0,0,0,${rectFill})"/>
      <text font-size="${fontSize}" fill="rgba(255,255,255,${textFill})" font-family="sans-serif">
        ${tspans}
      </text>
    </svg>`
  )

  const ext = filePath.toLowerCase()
  let pipeline = sharp(filePath).composite([{ input: svg, top: 0, left: 0 }])
  if (ext.endsWith('.png')) pipeline = pipeline.png()
  else if (ext.endsWith('.webp')) pipeline = pipeline.webp({ quality: 90 })
  else pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true })

  const buffer = await pipeline.toBuffer()
  fs.writeFileSync(filePath, buffer)
  return { applied: true, width, height }
}

/**
 * 对相册新绑定的图片 URL 打水印（已存在相册内的 URL 跳过）
 * @param {string} rawUrl
 * @param {{ album: object, nodeTitle: string, previousUrls: Set<string> }} ctx
 */
async function watermarkAlbumImageUrl(rawUrl, ctx = {}) {
  const normalized = rewriteMediaUrlForCurrentBase(rawUrl)
  if (!normalized) return normalized
  // UI-ALB 沉浸阅读：C 端不烧录门店/车辆/编号水印（证据链保留在库表）；新绑定图不再叠加水印
  return normalized
  /* legacy B-MEDIA-06 — 按需恢复
  const previous = ctx.previousUrls
  ...
  */
}

module.exports = {
  buildWatermarkLines,
  applyBusinessWatermark,
  watermarkAlbumImageUrl,
}
