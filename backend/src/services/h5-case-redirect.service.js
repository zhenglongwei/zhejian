/**
 * DS-B-10 · 旧案例 URL 301 跳转至 slug 页
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { buildCasePagePath, buildLegacyCaseViewPath } = require('../utils/case-slug')

async function resolveCaseRedirectTarget(caseId) {
  const id = String(caseId || '').trim()
  if (!id) {
    const err = new Error('缺少案例 ID')
    err.status = 400
    throw err
  }

  const row = await prisma.publicCase.findFirst({
    where: { id, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    select: { id: true, slug: true },
  })

  if (!row) {
    const err = new Error('案例不存在或未公开')
    err.status = 404
    throw err
  }

  if (row.slug) {
    return {
      status: 301,
      location: buildCasePagePath(row.slug),
      slug: row.slug,
    }
  }

  // 无 slug 时回退旧链并带 legacy=1，避免 Nginx rewrite → API → 302 死循环
  const legacyPath = `${buildLegacyCaseViewPath(row.id)}&legacy=1`
  return {
    status: 302,
    location: legacyPath,
    slug: null,
  }
}

module.exports = {
  resolveCaseRedirectTarget,
}
