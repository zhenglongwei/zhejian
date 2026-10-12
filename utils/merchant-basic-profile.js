/**
 * 基础资料完善度。只看名称、地址、电话、营业时间、介绍、环境照片。
 * 不算执照、维修资质、品牌授权、技师。
 */

const INTRO_FULL = 40
const PLACEHOLDER_NAME = '我的门店'

function text(value) {
  return String(value || '').trim()
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

function readSlots(input = {}) {
  const photos = input.photos && typeof input.photos === 'object' ? input.photos : {}
  const reception = list(input.receptionPhotoUrls || photos.receptionUrls)
  const singleReception = text(photos.receptionUrl || photos.receptionPhotoUrl)
  return {
    name: text(input.storeName || input.name),
    address: text(input.address),
    phone: text(input.storePhone || input.phone || input.contactPhone),
    hours: text(input.businessHours),
    intro: text(input.intro),
    facade: text(input.facadePhotoUrl || photos.facadeUrl),
    workshop: list(input.workshopPhotoUrls || photos.workshopUrls),
    reception: reception.length ? reception : (singleReception ? [singleReception] : []),
    services: serviceNames(input),
  }
}

function serviceNames(input = {}) {
  return (input.services || [])
    .map((item) => {
      if (typeof item === 'string') return text(item)
      return text(item && (item.name || item.label || item.serviceName))
    })
    .filter(Boolean)
}

function introPoints(intro) {
  if (!intro) return 0
  if (intro.length >= INTRO_FULL) return 25
  return 12
}

function gapNote(item, slots) {
  if (item.key === 'intro' && slots.intro) return '门店介绍写短了'
  if (item.key === 'intro') return '还没写门店介绍'
  if (item.key === 'facade') return '还没拍门头'
  if (item.key === 'workshop') return '还没拍工位'
  if (item.key === 'reception') return '还没拍接待区'
  if (item.key === 'name') return '还没填门店名称'
  if (item.key === 'address') return '还没填地址'
  if (item.key === 'phone') return '还没填联系电话'
  if (item.key === 'hours') return '还没填营业时间'
  return `还没填${item.label}`
}

function scoreBasicProfile(input = {}) {
  const slots = readSlots(input)
  const items = [
    { key: 'name', label: '门店名称', max: 10, points: slots.name && slots.name !== PLACEHOLDER_NAME ? 10 : 0 },
    { key: 'address', label: '地址', max: 15, points: slots.address ? 15 : 0 },
    { key: 'phone', label: '联系电话', max: 10, points: slots.phone ? 10 : 0 },
    { key: 'hours', label: '营业时间', max: 10, points: slots.hours ? 10 : 0 },
    { key: 'intro', label: '门店介绍', max: 25, points: introPoints(slots.intro) },
    { key: 'facade', label: '门头', max: 10, points: slots.facade ? 10 : 0 },
    { key: 'workshop', label: '工位', max: 10, points: slots.workshop.length ? 10 : 0 },
    { key: 'reception', label: '接待区', max: 10, points: slots.reception.length ? 10 : 0 },
  ]
  const score = items.reduce((sum, item) => sum + item.points, 0)
  const missing = items.filter((item) => item.points < item.max)
  const gaps = missing.map((item) => ({ key: item.key, note: gapNote(item, slots) }))
  return {
    score,
    complete: score === 100,
    missingCount: missing.length,
    missingLine: gaps.map((item) => item.note).join('、'),
    label: score === 100 ? '基础资料已齐' : '',
    gaps,
    items,
  }
}

function foundedOf(value, now) {
  const year = Number(String(value || '').slice(0, 4))
  const thisYear = now.getFullYear()
  if (!year || year < 1950 || year > thisYear) return null
  const span = thisYear - year
  return { year, span: span > 0 ? span : 1 }
}

function namedTechCount(input = {}) {
  return (input.technicians || []).filter((item) => text(item && item.name)).length
}

function stripPlain(value) {
  return text(value).replace(/\s+/g, '')
}

function polishIntro(input = {}, now = new Date()) {
  const raw = text(input.intro)
  if (!raw) return { hints: ['先写一段介绍，再点润色'], draft: '' }

  const body = raw
    .replace(/\s+/g, '')
    .replace(/，?位于[\u4e00-\u9fa5]{2,12}(?:区|县|市)/g, '')
    .replace(/。?主营[^。]+/g, '')
    .replace(/[。．.]+$/g, '')
  if (!body) return { hints: ['先写一段介绍，再点润色'], draft: '' }

  const name = text(input.storeName || input.name)
  const founded = foundedOf(input.licenseEstablishedOn, now)
  const techs = namedTechCount(input)
  const clauses = body.split(/[。；;]/).map((item) => item.trim()).filter(Boolean)
  let focus = clauses[0] || ''
  const traits = clauses.slice(1)

  if (name && focus.indexOf(name) === 0) focus = focus.slice(name.length).replace(/^[，,]/, '')
  focus = focus.replace(/^成立于\d{4}年[，,]?/, '').replace(/^成立于\s*\d{4}\s*年[，,]?/, '')
  focus = focus.replace(/门店有\s*\d+\s*位技师[，,]?/g, '').replace(/拥有\s*\d+\s*位[^，。]*/g, '')

  if (founded && focus && !/\d+\s*年/.test(focus)) focus = `${focus} ${founded.span} 年`

  const sentences = []
  if (founded) {
    const open = name ? `${name}成立于 ${founded.year} 年` : `成立于 ${founded.year} 年`
    sentences.push(focus ? `${open}，${focus}` : open)
  } else if (focus) {
    const lead = name && focus.indexOf(name) < 0 ? name : ''
    sentences.push(`${lead}${focus}`)
  }

  const traitText = traits.join('，')
  let second = ''
  if (techs && body.indexOf('位技师') < 0 && body.indexOf('位专业') < 0) second = `门店有 ${techs} 位技师`
  if (traitText) second = second ? `${second}，${traitText}` : traitText
  if (second) sentences.push(second)

  let draft = sentences.filter(Boolean).join('。')
  if (draft && !/。$/.test(draft)) draft = `${draft}。`
  draft = draft.replace(/。。+/g, '。').slice(0, 500)
  if (!draft || stripPlain(draft) === stripPlain(raw) || stripPlain(draft) === `${stripPlain(body)}。`) {
    return { hints: ['这段可以了'], draft: '' }
  }
  return { hints: [], draft }
}

function sizeTip(label, meta) {
  if (!meta || !meta.width || !meta.height) return ''
  if (meta.width < 720) return `${label}偏小，换一张更清楚的`
  if (meta.height > meta.width * 1.4) return `${label}太竖，换一张横图`
  return ''
}

function photoAdvice(input = {}, meta = {}) {
  const slots = readSlots(input)
  const lines = []
  if (!slots.facade) lines.push('补一张门头，招牌要拍清楚')
  else {
    const tip = sizeTip('门头', meta[slots.facade])
    if (tip) lines.push(tip)
  }
  if (!slots.workshop.length) lines.push('补一张工位，拍到作业区')
  else {
    const tip = sizeTip('工位', meta[slots.workshop[0]])
    if (tip) lines.push(tip)
  }
  if (!slots.reception.length) lines.push('补一张接待或休息的地方')
  else {
    const tip = sizeTip('接待区', meta[slots.reception[0]])
    if (tip) lines.push(tip)
  }
  if (!lines.length) lines.push('门头、工位、接待区都有了')
  return { lines: lines.slice(0, 3) }
}

function certSummary(input = {}) {
  const photos = input.photos && typeof input.photos === 'object' ? input.photos : {}
  const qualification = input.qualification && typeof input.qualification === 'object' ? input.qualification : {}
  const hasLicense = Boolean(text(input.licensePhotoUrl || photos.licenseUrl))
  const hasQual = Boolean(text(input.qualificationPhotoUrl || qualification.photoUrl))
  const techCount = (input.technicians || []).filter((item) => text(item && item.name)).length
  const bits = []
  if (hasLicense) bits.push('执照已传')
  else if (hasQual) bits.push('资质已传')
  if (techCount) bits.push(`${techCount} 位技师`)
  return {
    techCount,
    done: hasLicense || hasQual || techCount > 0,
    value: bits.join(' · ') || '待补充',
  }
}

module.exports = {
  scoreBasicProfile,
  polishIntro,
  photoAdvice,
  certSummary,
  readSlots,
}
