/**
 * 短图文这一屏的勾选与各平台短句。身份用图片 id、平台 id，不用第几张。
 */

function linesByImage(cards) {
  const lines = {}
  const rank = new Map()
  const lead = (cards || []).find((card) => card && card.id === 'xiaohongshu')
  ;((lead && lead.slides) || []).forEach((slide, index) => {
    if (!slide || !slide.id) return
    rank.set(String(slide.id), index)
  })
  ;(cards || []).forEach((card) => {
    if (!card || card.id === 'moments') return
    ;(card.slides || []).forEach((slide) => {
      if (!slide || !slide.id) return
      const id = String(slide.id)
      if (!lines[id]) lines[id] = {}
      lines[id][card.id] = slide.line || ''
    })
  })
  return { lines, rank }
}

function createSocialState(payload = {}, emptyText = '') {
  const attached = linesByImage(payload.cards)
  const images = (payload.images || [])
    .filter((img) => img && img.id && img.url)
    .map((img) => ({
      id: String(img.id),
      url: String(img.url),
      checked: true,
      lines: attached.lines[String(img.id)] || {},
    }))
    .sort((a, b) => {
      const left = attached.rank.has(a.id) ? attached.rank.get(a.id) : 999
      const right = attached.rank.has(b.id) ? attached.rank.get(b.id) : 999
      return left - right
    })
  const socialTexts = {}
  const socialCaptions = {}
  ;(payload.cards || []).forEach((card) => {
    if (!card || !card.id) return
    socialTexts[card.id] = card.text || ''
    socialCaptions[card.id] = card.caption || ''
  })
  const socialPlatform = (payload.cards && payload.cards[0] && payload.cards[0].id) || 'moments'
  return {
    socialVisible: true,
    socialLoading: false,
    socialPlatforms: (payload.cards || [])
      .filter((card) => card && card.id)
      .map((card) => ({ id: card.id, label: card.label || card.id })),
    socialPlatform,
    socialImages: images,
    socialTexts,
    socialCaptions,
    socialText: socialTexts[socialPlatform] || '',
    socialCaption: socialCaptions[socialPlatform] || '',
    socialEmptyText: emptyText,
    socialSaveDisabled: images.length === 0,
  }
}

function rememberSocialText(page, value) {
  const id = page.data.socialPlatform
  if (!id) return
  if (!page._socialTexts) page._socialTexts = { ...(page.data.socialTexts || {}) }
  page._socialTexts[id] = value
}

function rememberSocialCaption(page, value) {
  const id = page.data.socialPlatform
  if (!id) return
  if (!page._socialCaptions) page._socialCaptions = { ...(page.data.socialCaptions || {}) }
  page._socialCaptions[id] = value
}

function readSocialText(page) {
  const id = page.data.socialPlatform
  const map = page._socialTexts || page.data.socialTexts || {}
  return map[id] || ''
}

function switchSocialPlatform(page, id) {
  if (!id || id === page.data.socialPlatform) return
  const map = page._socialTexts || page.data.socialTexts || {}
  const captions = page._socialCaptions || page.data.socialCaptions || {}
  page.setData({
    socialPlatform: id,
    socialText: map[id] || '',
    socialCaption: captions[id] || '',
  })
}

function toggleSocialImage(page, id) {
  if (!id) return
  const socialImages = (page.data.socialImages || []).map((img) => (
    img.id === id ? { ...img, checked: !img.checked } : img
  ))
  page.setData({
    socialImages,
    socialSaveDisabled: !socialImages.some((img) => img.checked),
  })
}

function checkedSocialUrls(page) {
  return (page.data.socialImages || []).filter((img) => img.checked && img.url).map((img) => img.url)
}

function applySocialPayload(page, payload, emptyText) {
  const social = createSocialState(payload, emptyText)
  page._socialTexts = social.socialTexts || {}
  page._socialCaptions = { ...(social.socialCaptions || {}) }
  page.setData({
    ...social,
    socialLoading: false,
    socialRefreshing: false,
    socialRevision: Date.now(),
  })
}

module.exports = {
  createSocialState,
  applySocialPayload,
  rememberSocialText,
  rememberSocialCaption,
  readSocialText,
  switchSocialPlatform,
  toggleSocialImage,
  checkedSocialUrls,
}
