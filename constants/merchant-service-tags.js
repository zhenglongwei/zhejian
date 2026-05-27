/**
 * 商家入驻 — 擅长服务预设标签
 * PRD: docs/03_商家端/01_商家入驻PRD.md §9
 */
const MERCHANT_SERVICE_TAG_OPTIONS = [
  '小保养',
  '刹车维修',
  '电瓶更换',
  '轮胎服务',
  '空调维修',
  '钣喷修复',
  '底盘维修',
  '事故车维修',
  '新能源维修',
]

const MERCHANT_SERVICE_TAG_MAX = 10
const MERCHANT_SERVICE_TAG_NAME_MAX = 16

module.exports = {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
}
