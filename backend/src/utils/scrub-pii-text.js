/**
 * 公开/送模文案 PII scrub（规则层）
 * 真源：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §6.1
 */

function scrubPiiText(text = '') {
  let value = String(text || '').trim()
  if (!value) return ''

  value = value.replace(/1[3-9]\d{9}/g, '[手机号已隐藏]')
  value = value.replace(
    /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]?/g,
    '[车牌已隐藏]',
  )
  value = value.replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '[VIN已隐藏]')
  value = value.replace(/\b\d{17}[\dXx]\b/g, '[证件号已隐藏]')
  value = value.replace(/\s{2,}/g, ' ').trim()
  return value
}

/** 递归 scrub 对象/数组中的字符串；跳过 URL 字段以免破坏图片地址 */
function scrubPiiDeep(value, options = {}) {
  const skipKeys = new Set(
    (options.skipKeys || ['url', 'rawUrl', 'maskedUrl', 'imageUrl', 'src']).map((k) =>
      String(k),
    ),
  )
  if (value == null) return value
  if (typeof value === 'string') return scrubPiiText(value)
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) => scrubPiiDeep(item, options))
  }
  const out = {}
  Object.keys(value).forEach((key) => {
    if (skipKeys.has(key)) {
      out[key] = value[key]
      return
    }
    out[key] = scrubPiiDeep(value[key], options)
  })
  return out
}

module.exports = {
  scrubPiiText,
  scrubPiiDeep,
}
