/** 搜索筛选与排序 — V2.0 P0（无评分/销量/在线支付） */
const DEFAULT_CITY = {
  code: 'hangzhou',
  name: '杭州',
}

const SORT_OPTIONS = {
  service: [
    { key: 'relevance', label: '综合' },
    { key: 'price_asc', label: '价格从低到高' },
    { key: 'price_desc', label: '价格从高到低' },
  ],
  merchant: [
    { key: 'relevance', label: '综合' },
    { key: 'distance', label: '距离最近', requiresLocation: true },
    { key: 'case_count', label: '案例数优先' },
  ],
  case: [
    { key: 'relevance', label: '综合' },
    { key: 'latest', label: '最新发布' },
  ],
}

const FILTER_OPTIONS = {
  supportAlbum: { key: 'supportAlbum', label: '支持服务相册' },
  openNow: { key: 'openNow', label: '营业中' },
  accidentCapable: { key: 'accidentCapable', label: '事故车能力' },
}

module.exports = {
  DEFAULT_CITY,
  SORT_OPTIONS,
  FILTER_OPTIONS,
}
