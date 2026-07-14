/**
 * 门店公开页差异化 FAQ（规则生成，不调用大模型）
 * 优先商家定制 → 门店事实派生 → 仅在不足时补通用预约类问题
 */

function sanitizeFaq(items) {
  return (items || [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const q = String(item.q || item.question || '').trim()
      const a = String(item.a || item.answer || '').trim()
      if (!q || !a) return null
      return { q, a }
    })
    .filter(Boolean)
}

function faqKey(q) {
  return String(q || '')
    .replace(/[？?！!。．\s]/g, '')
    .slice(0, 24)
}

function mergeFaq(preferred, extras, max = 5) {
  const out = []
  const seen = new Set()
  for (const list of [preferred, extras]) {
    for (const item of list || []) {
      if (!item || !item.q || !item.a) continue
      const key = faqKey(item.q)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ q: item.q, a: item.a })
      if (out.length >= max) return out
    }
  }
  return out
}

/**
 * @param {object} input
 * @returns {{ faq: Array<{q:string,a:string}>, faqSource: 'merchant'|'derived'|'mixed'|'fallback' }}
 */
function buildStorePublicFaq(input = {}) {
  const name = String(input.storeName || '该门店').trim() || '该门店'
  const custom = sanitizeFaq(input.customFaq)
  const specialties = Array.isArray(input.specialties) ? input.specialties.filter(Boolean) : []
  const vehicles = Array.isArray(input.vehicleSpecialties)
    ? input.vehicleSpecialties.filter(Boolean)
    : []
  const casePreviews = Array.isArray(input.casePreviews) ? input.casePreviews : []
  const serviceNames = Array.isArray(input.serviceNames) ? input.serviceNames.filter(Boolean) : []
  const address = String(input.address || '').trim()
  const businessHours = String(input.businessHours || '').trim()
  const phone = String(input.phone || '').trim()
  const caseCount = Number(input.caseCount) || casePreviews.length || 0

  const derived = []

  if (address || businessHours) {
    const bits = []
    if (address) bits.push(`地址：${address}`)
    if (businessHours) bits.push(`营业时间：${businessHours}`)
    derived.push({
      q: `${name}在哪里？营业时间是怎样的？`,
      a: `${bits.join('。')}。到店前建议先电话或通过页面预约入口确认当天是否接待。`,
    })
  }

  if (specialties.length) {
    derived.push({
      q: `${name}主要提供哪些维修服务？`,
      a: `公开资料显示该店擅长${specialties.slice(0, 6).join('、')}等项目。是否适合您的车况，需结合到店检查确认。`,
    })
  }

  if (vehicles.length) {
    derived.push({
      q: `${name}擅长哪些车型？`,
      a: `门店公开擅长车型包括${vehicles.slice(0, 8).join('、')}。实际能否承接以到店沟通与检查为准。`,
    })
  }

  if (caseCount > 0) {
    const titles = casePreviews
      .map((item) => item.title || item.serviceName || '')
      .filter(Boolean)
      .slice(0, 3)
    derived.push({
      q: `${name}有哪些可查的公开维修案例？`,
      a: titles.length
        ? `目前可查看的案例包括：${titles.join('；')}。可在本页「真实维修案例」点开详情，查看过程说明与费用参考。`
        : `本页提供已审核的公开维修案例，可点开查看维修过程与费用参考。`,
    })
  }

  if (serviceNames.length) {
    derived.push({
      q: `如何预约${name}的服务？`,
      a: phone
        ? `可通过本页预约入口或拨打 ${phone} 联系门店，确认到店时间。当前可预约服务包括${serviceNames
            .slice(0, 4)
            .join('、')}等；实际方案与费用以到店检测为准。`
        : `可通过本页预约入口联系门店，确认到店时间。当前可预约服务包括${serviceNames
            .slice(0, 4)
            .join('、')}等；实际方案与费用以到店检测为准。`,
    })
  } else {
    derived.push({
      q: `如何预约${name}？`,
      a: phone
        ? `可通过本页预约入口或拨打 ${phone} 联系门店，确认到店时间与检测项目。`
        : `可通过本页预约入口联系门店，确认到店时间与检测项目。`,
    })
  }

  derived.push({
    q: '公开案例上的价格是否就是最终费用？',
    a: '案例价格为当时维修方案参考，受车型、配件与施工范围影响；最终费用以到店检测和门店报价为准。',
  })

  const fallback = [
    {
      q: '如何预约该门店？',
      a: '可通过页面预约入口或电话联系门店，确认到店时间与检测项目。',
    },
  ]

  const faq = mergeFaq(custom, derived.length ? derived : fallback, 5)
  let faqSource = 'fallback'
  if (custom.length && derived.length) faqSource = 'mixed'
  else if (custom.length) faqSource = 'merchant'
  else if (derived.length) faqSource = 'derived'

  return { faq, faqSource }
}

module.exports = {
  sanitizeFaq,
  buildStorePublicFaq,
  mergeFaq,
}
