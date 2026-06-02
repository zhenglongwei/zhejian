const { getCategoryName, getServiceItem } = require('../constants/service-catalog')
const { deriveClientStatus } = require('../constants/service-plan')
const { toIso } = require('../lib/ids')

function formatPublishedDate(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function formatPlanRecord(row, store) {
  const item = getServiceItem(row.serviceItemId)
  const status = deriveClientStatus(row)
  return {
    id: row.id,
    serviceItemId: row.serviceItemId,
    categoryId: row.categoryId || item?.categoryId || '',
    categoryName: getCategoryName(row.categoryId || item?.categoryId),
    name: row.name,
    summary: row.summary,
    detail: row.detail,
    priceMode: row.priceMode,
    amount: row.amount,
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
    priceFactors: Array.isArray(row.priceFactors) ? row.priceFactors : [],
    includedItems: Array.isArray(row.includedItems) ? row.includedItems : [],
    excludedItems: Array.isArray(row.excludedItems) ? row.excludedItems : [],
    appointmentJson:
      row.appointmentJson && typeof row.appointmentJson === 'object'
        ? row.appointmentJson
        : {},
    coverUrl: row.coverUrl || '',
    storeId: row.storeId,
    storeName: store?.name || '',
    merchantId: row.merchantId,
    status,
    auditStatus: row.auditStatus,
    saleStatus: row.saleStatus,
    acceptAppointment: row.acceptAppointment !== false,
    rejectReason: row.rejectReason || '',
    submittedAt: toIso(row.submittedAt),
    approvedAt: toIso(row.approvedAt),
    publishedAt: formatPublishedDate(row.publishedAt),
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : row.updatedAt,
    complexityLevel: item?.complexityLevel || '',
  }
}

module.exports = {
  formatPlanRecord,
  formatPublishedDate,
}
