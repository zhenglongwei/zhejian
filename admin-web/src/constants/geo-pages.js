export const GEO_PAGE_STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'noindex', label: '已发布(noindex)' },
]

export const GEO_PAGE_TYPE_OPTIONS = [
  { value: 'city_service', label: '城市+服务' },
  { value: 'fault_qa', label: '故障问答' },
  { value: 'city_fault', label: '城市+故障' },
  { value: 'vehicle_service', label: '车型+服务' },
  { value: 'case_agg', label: '案例聚合' },
  { value: 'case_collection', label: '案例合集' },
  { value: 'district_service', label: '城区服务' },
  { value: 'merchant_geo', label: '门店专题' },
]

export function statusLabel(status) {
  const map = {
    draft: '草稿',
    published: '已发布',
    noindex: 'noindex',
  }
  return map[status] || status || '—'
}

export function pageTypeLabel(pageType) {
  const item = GEO_PAGE_TYPE_OPTIONS.find((opt) => opt.value === pageType)
  return item ? item.label : pageType || '—'
}
