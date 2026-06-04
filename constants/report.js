const {
  COMPLIANCE_COPY,
  REPORT_SUCCESS_MESSAGE,
} = require('./compliance-copy')

const REPORT_TARGET_TYPE = {
  SERVICE: 'service',
  STORE: 'store',
  CASE: 'case',
  GEO: 'geo',
}

const REPORT_TYPE = {
  FALSE_PRICE: 'false_price',
  FALSE_PROMISE: 'false_promise',
  FALSE_QUALIFICATION: 'false_qualification',
  FAKE_CASE: 'fake_case',
  MISLEADING_MEDIA: 'misleading_media',
  OTHER: 'other',
}

const REPORT_TYPE_OPTIONS = [
  { value: REPORT_TYPE.FALSE_PRICE, label: '虚假或误导性价格' },
  { value: REPORT_TYPE.FALSE_PROMISE, label: '夸大宣传/虚假承诺' },
  { value: REPORT_TYPE.FALSE_QUALIFICATION, label: '资质、授权造假' },
  { value: REPORT_TYPE.FAKE_CASE, label: '伪造、盗用案例' },
  { value: REPORT_TYPE.MISLEADING_MEDIA, label: '误导性图片或文案' },
  { value: REPORT_TYPE.OTHER, label: '其他虚假信息' },
]

const REPORT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
}

const REPORT_CONSENT_TEXT = COMPLIANCE_COPY.reportConsent

const REPORT_TYPE_LABEL = Object.fromEntries(
  REPORT_TYPE_OPTIONS.map((item) => [item.value, item.label])
)

const REPORT_TARGET_TYPE_LABEL = {
  service: '服务',
  store: '门店',
  case: '案例',
  geo: '专题',
}

const REPORT_STATUS_LABEL = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已成立',
  rejected: '已驳回',
}

module.exports = {
  REPORT_TARGET_TYPE,
  REPORT_TYPE,
  REPORT_TYPE_OPTIONS,
  REPORT_STATUS,
  REPORT_CONSENT_TEXT,
  REPORT_SUCCESS_MESSAGE,
  REPORT_TYPE_LABEL,
  REPORT_TARGET_TYPE_LABEL,
  REPORT_STATUS_LABEL,
}
