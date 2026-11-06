/**
 * 短图文：朋友圈 / 小红书 / 抖音。
 * 按事实现算，不写金额，不带链接。纯函数，小程序与 backend 共用。
 */

const PLATFORMS = [
  { id: 'moments', label: '朋友圈', maxChars: 160 },
  { id: 'xiaohongshu', label: '小红书', maxChars: 450 },
  { id: 'douyin', label: '抖音', maxChars: 300 },
]

const BANNED = [
  /好评返现/g,
  /晒图返现/g,
  /分享赚钱/g,
  /转发领钱/g,
  /点击有奖/g,
  /全网最低/g,
  /100%\s*修好/g,
  /包修好/g,
  /永久不复发/g,
]

function stripSocialText(text = '') {
  let value = String(text || '')
  value = value.replace(/方案参考费用约[^。；;\n]*/g, '')
  value = value.replace(/[¥￥]\s*\d[\d,]*(?:\.\d+)?/g, '')
  value = value.replace(/\d[\d,]*(?:\.\d+)?\s*元/g, '')
  value = value.replace(/(?:电话|手机|联系方式)\s*[:：]?\s*1[3-9]\d{9}/g, '')
  value = value.replace(/1[3-9]\d{9}/g, '')
  BANNED.forEach((pattern) => {
    value = value.replace(pattern, '')
  })
  return value
    .replace(/\s*[，,、；;]\s*(?=[，,、；;。]|$)/g, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[，,；;。]\s*/u, '')
    .trim()
}

function clip(text, max) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const punct = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('\n'))
  if (punct > Math.floor(max * 0.55)) return cut.slice(0, punct + 1).trim()
  return cut.trim()
}

function sentence(text, max = 42) {
  const clean = stripSocialText(text)
  if (!clean) return ''
  const line = clean.split(/[。！？\n]/).map((part) => part.trim()).filter(Boolean)[0] || ''
  return line.slice(0, max)
}

function noteLines(facts, count) {
  const out = []
  ;(facts.notes || []).forEach((note) => {
    if (out.length >= count) return
    const line = sentence(note)
    if (line) out.push(line)
  })
  return out
}

function finish(lines) {
  return lines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .join('\n')
}

function composeOwner(facts) {
  const service = facts.serviceName || '这次维修'
  const vehicle = facts.vehicleLabel || ''
  const note = noteLines(facts, 1)[0] || ''
  const who = vehicle ? `我这台${vehicle}` : '我这台车'
  return {
    moments: finish([`${who}今天把${service}做了。`, note]),
    xhs: finish([`${who}，${service}做完了。`, note]),
    douyin: finish([`${who}，${service}。`, note]),
    slideLine: sentence(`${vehicle}${service}`, 14) || sentence(service, 14),
  }
}

function composeMerchant(facts) {
  const service = facts.serviceName || sentence(facts.title, 18) || '这次维修'
  const vehicle = facts.vehicleLabel || ''
  const detail = sentence(facts.summary, 36) || noteLines(facts, 1)[0] || ''
  const head = vehicle ? `这台${vehicle}` : '这台车'
  return {
    moments: finish([`${head}，${service}。`, detail]),
    xhs: finish([`${head}${service}。`, detail]),
    douyin: finish([`${vehicle || '这台车'}，${service}。`, detail]),
    slideLine: sentence(`${vehicle}${service}`, 14) || sentence(service, 14),
  }
}

function sanitizeFacts(raw = {}) {
  const notes = Array.isArray(raw.notes) ? raw.notes : []
  return {
    serviceName: stripSocialText(raw.serviceName || ''),
    storeName: stripSocialText(raw.storeName || ''),
    city: stripSocialText(raw.city || ''),
    vehicleLabel: stripSocialText(raw.vehicleLabel || ''),
    title: stripSocialText(raw.title || ''),
    summary: stripSocialText(raw.summary || ''),
    notes: notes.map((note) => stripSocialText(note)).filter(Boolean).slice(0, 4),
  }
}

function normalizeImages(images) {
  const seenId = new Set()
  const seenUrl = new Set()
  const out = []
  ;(Array.isArray(images) ? images : []).forEach((item) => {
    if (!item) return
    const id = String(item.id || '').trim()
    const url = String(item.url || '').trim()
    if (!id || !url || seenId.has(id)) return
    // 不同 id 指向同一文件（URL 仅签名参数不同）也只保留一张
    const urlKey = url.split('?')[0]
    if (urlKey && seenUrl.has(urlKey)) return
    seenId.add(id)
    if (urlKey) seenUrl.add(urlKey)
    out.push({ id, url })
  })
  return out.slice(0, 9)
}

function slidesFor(images, line, keepLine) {
  return images.map((img) => ({
    id: img.id,
    line: keepLine ? String(line || '').trim() : '',
  }))
}

function buildSocialCardSet({ audience = 'owner', facts = {}, images = [] } = {}) {
  const safe = sanitizeFacts(facts)
  const voice = audience === 'merchant' ? composeMerchant(safe) : composeOwner(safe)
  const list = normalizeImages(images)
  const cards = [
    {
      id: 'moments',
      label: '朋友圈',
      text: clip(voice.moments, 160),
      caption: '',
      slides: slidesFor(list, '', false),
    },
    {
      id: 'xiaohongshu',
      label: '小红书',
      text: '',
      caption: clip(voice.xhs, 450),
      slides: slidesFor(list, voice.slideLine, true),
    },
    {
      id: 'douyin',
      label: '抖音',
      text: '',
      caption: clip(voice.douyin, 300),
      slides: slidesFor(list, voice.slideLine, true),
    },
  ]
  return {
    audience: audience === 'merchant' ? 'merchant' : 'owner',
    images: list,
    cards,
  }
}

module.exports = {
  PLATFORMS,
  stripSocialText,
  sanitizeFacts,
  buildSocialCardSet,
}
