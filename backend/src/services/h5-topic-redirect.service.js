/**
 * 旧专题书签：仅门店/城市/首页等非专题目标仍跳转。
 */
const { resolveLegacyTopicRedirect } = require('../utils/geo-page-service-resolve')

/**
 * @param {string} slugOrId
 * @returns {Promise<{ location: string, status: number } | null>}
 */
async function resolveTopicRedirectTarget(slugOrId) {
  const slug = String(slugOrId || '').trim()
  if (!slug) return null
  const legacy = resolveLegacyTopicRedirect(slug)
  if (!legacy || !legacy.location) return null
  if (String(legacy.location).startsWith('/topic/')) return null
  return legacy
}

module.exports = {
  resolveTopicRedirectTarget,
}
