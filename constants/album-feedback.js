/**
 * 服务相册问题反馈类型 — 对齐 07_维修相册查看页 §18.2
 */
const ALBUM_FEEDBACK_TYPE_OPTIONS = [
  { value: 'unclear_image', label: '图片看不清' },
  { value: 'unclear_note', label: '维修说明不清楚' },
  { value: 'vehicle_mismatch', label: '与实际车辆不符' },
  { value: 'missing_process', label: '未看到关键过程' },
  { value: 'result_concern', label: '对维修结果有疑问' },
  { value: 'other', label: '其他' },
]

const { AUTHORIZATION_CONSENT } = require('./compliance-copy')

const ALBUM_FEEDBACK_CONSENT_TEXT = AUTHORIZATION_CONSENT.album_feedback.text

const ALBUM_FEEDBACK_SUCCESS_MESSAGE =
  '反馈已提交，平台将协助转达门店。如有紧急问题，建议同时电话联系门店。'

module.exports = {
  ALBUM_FEEDBACK_TYPE_OPTIONS,
  ALBUM_FEEDBACK_CONSENT_TEXT,
  ALBUM_FEEDBACK_SUCCESS_MESSAGE,
}
