/**
 * 车主端社交媒体长文 · 优先服务端 LLM，失败回落本地模板
 */

const SOCIAL_PLATFORMS = [
  { id: 'xiaohongshu', label: '小红书' },
  { id: 'zhihu', label: '知乎' },
  { id: 'toutiao', label: '今日头条' },
  { id: 'wechat_mp', label: '微信公众号' },
  { id: 'douyin', label: '抖音' },
]

function pickStoreName(detail = {}) {
  return (detail.store && detail.store.name) || detail.storeName || ''
}

function pickServiceName(detail = {}) {
  return detail.serviceName || detail.title || '本次维修'
}

function pickVehicleLine(detail = {}) {
  const v = detail.vehicle || {}
  const parts = [v.brand, v.series, v.model].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return detail.vehicleLabel || detail.vehicleDisplay || detail.carModel || ''
}

function pickCity(detail = {}) {
  return (
    (detail.store && (detail.store.city || detail.store.cityName)) ||
    detail.cityName ||
    detail.city ||
    ''
  )
}

function buildBaseFacts(detail = {}) {
  return {
    serviceName: pickServiceName(detail),
    storeName: pickStoreName(detail),
    vehicle: pickVehicleLine(detail),
    city: pickCity(detail),
  }
}

/** 本地回落（与后端规则稿同思路，偏短、少套话） */
function buildSocialDraft(detail = {}, platformId = 'xiaohongshu') {
  const { serviceName, storeName, vehicle, city } = buildBaseFacts(detail)
  const storeBit = [city, storeName].filter(Boolean).join(' · ')

  if (platformId === 'zhihu') {
    return [
      `前阵子做了一次${serviceName}${vehicle ? `（${vehicle}）` : ''}，记一下供参考。`,
      storeBit ? `门店在${storeBit}。` : '',
      '我不是修车的，内容仅个人经历。过程在辙见服务相册里留了档。',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  if (platformId === 'toutiao') {
    return [
      `${storeBit ? `${storeBit}｜` : ''}${serviceName}过程笔记`,
      '',
      vehicle ? `车：${vehicle}` : '',
      `项目：${serviceName}`,
      '内容已脱敏，费用与方案以到店确认为准。',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (platformId === 'wechat_mp') {
    return [
      `${serviceName}｜车主过程记录`,
      '',
      `${serviceName}做完了${vehicle ? `，车是${vehicle}` : ''}。`,
      storeBit ? `去的是${storeBit}。` : '',
      '公开发出去的版本会脱敏。费用和方案仍以到店沟通为准。',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  if (platformId === 'douyin') {
    return [
      `${serviceName}做完，记两句。`,
      vehicle ? `车：${vehicle}` : '',
      storeBit ? `店：${storeBit}` : '',
      '过程在相册留了档。仅个人经历，方案费用到店确认。',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    `${serviceName}${vehicle ? `｜${vehicle}` : ''}过程记录`,
    '',
    storeBit ? `在${storeBit}做的${serviceName}。` : `刚做完${serviceName}。`,
    '公开内容会脱敏。我自己也是记个参考。',
  ]
    .filter(Boolean)
    .join('\n')
}

function copyTextToClipboard(text) {
  const value = String(text || '').trim()
  if (!value) {
    wx.showToast({ title: '暂无文案', icon: 'none' })
    return Promise.reject(new Error('empty draft'))
  }
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({ title: '已复制，可粘贴发布', icon: 'success' })
        resolve(value)
      },
      fail: (err) => {
        wx.showToast({ title: '复制失败', icon: 'none' })
        reject(err)
      },
    })
  })
}

module.exports = {
  SOCIAL_PLATFORMS,
  buildSocialDraft,
  copyTextToClipboard,
}
