const { prisma } = require('../lib/prisma')
const { generateCaseFaq } = require('../utils/case-faq')

function mergeContentJson(existing, patch) {
  const base = existing && typeof existing === 'object' ? { ...existing } : {}
  return { ...base, ...patch }
}

/**
 * 为公开案例生成 FAQ 并可选写入 contentJson.faq
 * @param {string} caseId
 * @param {{ persist?: boolean, force?: boolean, coldStart?: boolean }} options
 */
async function generateAndSaveCaseFaq(caseId, options = {}) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    include: {
      album: {
        select: {
          serviceItemId: true,
          templateId: true,
          serviceName: true,
        },
      },
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const existingFaq = Array.isArray(content.faq) ? content.faq : []
  if (existingFaq.length >= 3 && !options.force) {
    return {
      caseId,
      faq: existingFaq,
      generated: false,
      source: 'existing',
    }
  }

  const coldStart =
    options.coldStart != null ? Boolean(options.coldStart) : Boolean(content.coldStart)
  const faq = generateCaseFaq({
    serviceName: row.serviceName || row.album?.serviceName || '',
    serviceItemId: row.album?.serviceItemId || '',
    templateId: row.album?.templateId || '',
    coldStart,
  })

  if (options.persist !== false) {
    await prisma.publicCase.update({
      where: { id: caseId },
      data: {
        contentJson: mergeContentJson(row.contentJson, { faq }),
      },
    })
  }

  return {
    caseId,
    faq,
    generated: true,
    source: 'template',
  }
}

module.exports = {
  generateAndSaveCaseFaq,
}
