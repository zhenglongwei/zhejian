/**
 * CASE-GATE-A · 相册完工合规闸门
 */
const ALBUM_COMPLIANCE_STATUS = {
  /** 尚未跑规则（未完工或待触发） */
  NONE: '',
  /** 规则运行中 / 待抽检 */
  PENDING: 'pending',
  /** 自动规则通过，待人抽检 */
  SPOT_CHECK: 'spot_check',
  /** 闸门 A 通过 · 商家锁定 + 用户可确认 */
  PASSED: 'passed',
  /** 闸门 A 驳回 · 商家可改 */
  REJECTED: 'rejected',
}

const ALBUM_COMPLIANCE_REVIEW_MODE = {
  AUTO: 'auto',
  SPOT_CHECK: 'spot_check',
  MANUAL: 'manual',
}

const ALBUM_COMPLIANCE_VIOLATION = {
  BANNED_PHRASE: 'banned_phrase',
  EXTERNAL_CONTACT: 'external_contact',
  EXTERNAL_WECHAT: 'external_wechat',
}

/** 违规宣传 / 承诺类（扩展 GEO 禁词） */
const ALBUM_COMPLIANCE_BANNED_PHRASES = [
  '好评返现',
  '晒图返现',
  '分享赚钱',
  '转发领钱',
  '全网最低',
  '100%修好',
  '保证一次修好',
  '永久不复发',
  '全城最便宜',
  '不修包赔',
  '加微信报价',
  '全网最好',
  '绝对靠谱',
  '包修好',
]

const EXTERNAL_CONTACT_PATTERNS = [
  { type: ALBUM_COMPLIANCE_VIOLATION.EXTERNAL_WECHAT, re: /(加微信|加我微信|微信同号|vx同号|\+?\s*v\s*x|weixin|微信号)/i },
  { type: ALBUM_COMPLIANCE_VIOLATION.EXTERNAL_CONTACT, re: /(1[3-9]\d{9})/ },
  { type: ALBUM_COMPLIANCE_VIOLATION.EXTERNAL_CONTACT, re: /(qq\s*[:：]?\s*\d{5,})/i },
]

const USER_CONFIRM_HINT = '门店已提交，内容待您确认'

module.exports = {
  ALBUM_COMPLIANCE_STATUS,
  ALBUM_COMPLIANCE_REVIEW_MODE,
  ALBUM_COMPLIANCE_VIOLATION,
  ALBUM_COMPLIANCE_BANNED_PHRASES,
  EXTERNAL_CONTACT_PATTERNS,
  USER_CONFIRM_HINT,
}
