/**
 * PV-REFORM · 公开文案 PII  scrub（规则层）
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

module.exports = {
  scrubPiiText,
}
