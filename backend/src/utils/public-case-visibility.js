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

module.exports = {
  publicCaseH5Where,
  isPublicCaseH5Visible,
}
