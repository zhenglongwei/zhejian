/**
 * 短图文：朋友圈 / 小红书 / 抖音。
 * 按事实现算，不写金额，不带链接。纯函数，小程序与 backend 共用。
 */

const PLATFORMS = [
  { id: 'moments', label: '朋友圈', maxChars: 160 },
  { id: 'xiaohongshu', label: '小红书', maxChars: 360 },
  { id: 'douyin', label: '抖音', maxChars: 72 },
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

function placeLine(facts) {
  return [facts.city, facts.storeName].filter(Boolean).join(' · ')
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

function composeOwner(platformId, facts) {
  const service = facts.serviceName || '这次维修'
  const vehicle = facts.vehicleLabel || ''
  const place = placeLine(facts)
  const note = noteLines(facts, 1)[0] || ''
  const more = noteLines(facts, 3)
  if (platformId === 'douyin') {
    return finish([
      vehicle ? `${vehicle}，${service}做完了` : `${service}做完了`,
      note,
    ])
  }
  if (platformId === 'xiaohongshu') {
    const title = vehicle ? `${vehicle}${service}，过程记一下` : `${service}，过程记一下`
    return finish([
      title,
      '',
      note || '到店之后的过程拍下来了',
      more[1] || '',
      '车牌打过码，都是实拍',
      place,
    ])
  }
  return finish([
    vehicle ? `${vehicle}，今天把${service}做了。` : `今天把${service}做了。`,
    note,
    place,
  ])
}

function composeMerchant(platformId, facts) {
  const head =
    sentence(facts.title, 22) ||
    [facts.vehicleLabel, facts.serviceName].filter(Boolean).join(' · ') ||
    '维修过程'
  const detail = sentence(facts.summary, 36) || noteLines(facts, 1)[0] || ''
  const extra = noteLines(facts, 2)[1] || ''
  const place = placeLine(facts)
  if (platformId === 'douyin') {
    return finish([head, detail])
  }
  if (platformId === 'xiaohongshu') {
    const title = /[|｜]/.test(head) ? head : `${head}｜过程`
    return finish([title, '', detail, extra, '实拍，车牌已打码', place])
  }
  return finish([`${head}。`, detail, place])
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
  const seen = new Set()
  const out = []
  ;(Array.isArray(images) ? images : []).forEach((item) => {
    if (!item) return
    const id = String(item.id || '').trim()
    const url = String(item.url || '').trim()
    if (!id || !url || seen.has(id)) return
    seen.add(id)
    out.push({ id, url })
  })
  return out.slice(0, 9)
}

function withCaption(card) {
  const lines = String(card.text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (card.id === 'xiaohongshu') {
    return {
      ...card,
      text: lines[0] || '',
      caption: lines.slice(1).join('\n'),
    }
  }
  if (card.id === 'douyin') {
    return {
      ...card,
      text: lines.slice(0, 2).join('\n'),
      caption: lines.slice(2).join('\n') || lines.slice(0, 2).join('\n'),
    }
  }
  return { ...card, caption: '' }
}

function buildSocialCardSet({ audience = 'owner', facts = {}, images = [] } = {}) {
  const safe = sanitizeFacts(facts)
  const voice = audience === 'merchant' ? composeMerchant : composeOwner
  const cards = PLATFORMS.map((platform) => withCaption({
    id: platform.id,
    label: platform.label,
    text: clip(voice(platform.id, safe), platform.maxChars),
  }))
  return {
    audience: audience === 'merchant' ? 'merchant' : 'owner',
    images: normalizeImages(images),
    cards,
  }
}

module.exports = {
  PLATFORMS,
  stripSocialText,
  sanitizeFacts,
  buildSocialCardSet,
}
