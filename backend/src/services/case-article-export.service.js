/**
 * DS-D-01 · 案例文章公众号导出（HTML / Markdown，与 H5 同源）
 */
const { config } = require('../config')
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  CASE_ARTICLE_H5_PUBLISHED_STATUSES,
} = require('../constants/case-article-status')
const { getCaseDetail } = require('./content.service')
const { buildCaseH5Url } = require('./case-article-publish.service')
const { buildWechatArticleExport } = require('../utils/case-article-wechat-export')

async function assertCaseExportable(caseId, options = {}) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      storeId: true,
      status: true,
      articleStatus: true,
      articleBody: true,
      title: true,
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (options.storeId && row.storeId !== options.storeId) {
    const err = new Error('无权导出该案例')
    err.status = 403
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    const err = new Error('案例未公开，暂无法导出公众号文章')
    err.status = 409
    throw err
  }
  if (options.requirePublishedH5) {
    if (!CASE_ARTICLE_H5_PUBLISHED_STATUSES.includes(row.articleStatus || '')) {
      const err = new Error('案例尚未发布至 H5，暂无法导出')
      err.status = 409
      throw err
    }
  }
  if (!String(row.articleBody || '').trim()) {
    const err = new Error('案例文章尚未生成，请先完成审核或执行 generate-content')
    err.status = 409
    err.code = 'ARTICLE_NOT_READY'
    throw err
  }
  return row
}

/**
 * @param {string} caseId
 * @param {{ storeId?: string, requirePublishedH5?: boolean }} [options]
 */
async function exportCaseArticleForWechat(caseId, options = {}) {
  await assertCaseExportable(caseId, options)
  const detail = await getCaseDetail(caseId)
  const exported = buildWechatArticleExport(detail, {
    publicBaseUrl: config.publicBaseUrl,
  })
  const h5Url = buildCaseH5Url({
    slug: detail.slug || (detail.seo && detail.seo.slug),
    caseId: detail.id,
    canonicalPath: detail.canonicalPath || (detail.seo && detail.seo.canonicalPath),
  })

  return {
    caseId: detail.id,
    title: exported.title,
    seoTitle: exported.seoTitle,
    html: exported.html,
    markdown: exported.markdown,
    h5Url: exported.h5Url || h5Url,
    storeUrl: exported.storeUrl,
    storeId: exported.storeId,
    storeName: exported.storeName,
    articleStatus: detail.articleStatus || (detail.article && detail.article.status) || '',
    serviceName: detail.serviceName || '',
    hints: [
      '将 HTML 粘贴至公众号图文编辑器（建议先粘贴到记事本再转入，避免多余样式）',
      '文末链接仅指向本店 H5，请勿改为其他门店或第三方链接',
      '发布后在运营台标记「已发公众号」以便统计',
    ],
  }
}

module.exports = {
  exportCaseArticleForWechat,
  assertCaseExportable,
}
