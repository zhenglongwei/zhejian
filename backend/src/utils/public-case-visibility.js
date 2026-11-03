/**
 * H5 / 公域读侧：已公开托管即可打开。
 * 不再另等旧「文章已发到网站」(articleStatus=published_h5)。
 */
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

function publicCaseH5Where(extra = {}) {
  return {
    status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    storefrontHidden: false,
    ...extra,
  }
}

function isPublicCaseH5Visible(row) {
  if (!row) return false
  if (row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) return false
  if (row.storefrontHidden) return false
  return true
}

/** 访客现在能不能打开。门店未达公开条件时，托管记录仍在，但不算上站。 */
function isPublicCaseOnPublicWeb(row, storePublicReady = true) {
  return isPublicCaseH5Visible(row) && storePublicReady !== false
}

function merchantHostedTag({ hosted = false, visibility = 'private', onPublicWeb = false } = {}) {
  if (!hosted) return '未托管'
  if (String(visibility || '') !== 'public') return '已托管·私密'
  if (onPublicWeb) return '已托管·公开'
  return '已托管·网站未展示'
}

function decorateMerchantHostPublicState(meta = {}, publicCase = null, storePublicReady = true) {
  const hosted = Boolean(meta && meta.hosted)
  const visibility = meta && meta.visibility === 'public' ? 'public' : 'private'
  const onPublicWeb = isPublicCaseOnPublicWeb(publicCase, storePublicReady)
  return {
    ...meta,
    onPublicWeb,
    hostedTag: merchantHostedTag({ hosted, visibility, onPublicWeb }),
  }
}

/** 再次公开上线：清掉「改回仅私密 / 取消托管」留下的下架标记 */
function publicCaseRelistPatch(seoNoindex = false) {
  return {
    storefrontHidden: false,
    seoNoindex: Boolean(seoNoindex),
  }
}

module.exports = {
  publicCaseH5Where,
  isPublicCaseH5Visible,
  isPublicCaseOnPublicWeb,
  merchantHostedTag,
  decorateMerchantHostPublicState,
  publicCaseRelistPatch,
}
