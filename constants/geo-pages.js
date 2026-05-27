/** GEO 专题页 — 类型与展示文案（用户可见，勿暴露内部枚举） */
const GEO_PAGE_TYPE = {
  CITY_SERVICE: 'city_service',
  DISTRICT_SERVICE: 'district_service',
  VEHICLE_SERVICE: 'vehicle_service',
  FAULT_QA: 'fault_qa',
  MERCHANT_GEO: 'merchant_geo',
  CASE_COLLECTION: 'case_collection',
}

const GEO_PAGE_TYPE_LABEL = {
  [GEO_PAGE_TYPE.CITY_SERVICE]: '城市服务',
  [GEO_PAGE_TYPE.DISTRICT_SERVICE]: '城区服务',
  [GEO_PAGE_TYPE.VEHICLE_SERVICE]: '车型服务',
  [GEO_PAGE_TYPE.FAULT_QA]: '故障问答',
  [GEO_PAGE_TYPE.MERCHANT_GEO]: '门店专题',
  [GEO_PAGE_TYPE.CASE_COLLECTION]: '案例合集',
}

const GEO_TOPIC_TAG = '本地专题'

function getGeoPageTypeLabel(pageType) {
  return GEO_PAGE_TYPE_LABEL[pageType] || '专题'
}

function isAccidentGeoPage(page) {
  if (!page) return false
  if (page.pageType === GEO_PAGE_TYPE.CASE_COLLECTION) {
    const text = [page.title, page.summary, ...(page.keywords || [])].join('')
    return text.includes('事故')
  }
  return false
}

module.exports = {
  GEO_PAGE_TYPE,
  GEO_PAGE_TYPE_LABEL,
  GEO_TOPIC_TAG,
  getGeoPageTypeLabel,
  isAccidentGeoPage,
}
