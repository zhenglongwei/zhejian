const { prisma } = require('../lib/prisma')
const { normalizeCaseFaqLinks } = require('../utils/case-faq-links')

function mergeContentJson(existing, patch) {
  const base = existing && typeof existing === 'object' ? { ...existing } : {}
  return { ...base, ...patch }
}

/**
 * 读取案例已配置的 FAQ 外链（不再自动生成）
 * @param {string} caseId
 */
async function generateAndSaveCaseFaq(caseId) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const faq = normalizeCaseFaqLinks(content.faq)

  return {
    caseId,
    faq,
    generated: false,
    source: 'manual',
    deprecated: true,
    message: '案例 FAQ 已改为运营手动配置公众号外链，不再自动生成',
  }
}

module.exports = {
  generateAndSaveCaseFaq,
}
