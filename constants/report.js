const REPORT_TARGET_TYPE = {
  SERVICE: 'service',
  CASE: 'case',
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

const REPORT_CONSENT_TEXT =
  '信息仅供查阅，举报不代表内容已核实；恶意举报可能承担法律责任。'

const REPORT_SUCCESS_MESSAGE = '已收到，我们将在 3 个工作日内处理'

module.exports = {
  REPORT_TARGET_TYPE,
  REPORT_TYPE,
  REPORT_TYPE_OPTIONS,
  REPORT_STATUS,
  REPORT_CONSENT_TEXT,
  REPORT_SUCCESS_MESSAGE,
}
