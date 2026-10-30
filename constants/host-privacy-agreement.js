/**
 * 托管公开 · 隐私责任协议（商家端）
 * 版本须与 backend case-hosting HOST_PRIVACY_AGREEMENT_VERSION 一致。
 * 正文暂为占位：法务定稿后只替换本文案，勿改版本号流程除非协议实质变更。
 */

const HOST_PRIVACY_AGREEMENT_VERSION = 'host_privacy_v2'

const HOST_PRIVACY_AGREEMENT_TITLE = '公开内容隐私责任协议'

/** @type {{ heading: string, paragraphs: string[] }[]} */
const HOST_PRIVACY_AGREEMENT_SECTIONS = [
  {
    heading: '第一条 协议目的',
    paragraphs: [
      '本协议适用于门店通过辙见服务平台，将本单服务档案以公开形式展示于店页及相关公开渠道的行为。',
      '【条款正文待法务定稿后替换。】',
    ],
  },
  {
    heading: '第二条 发布者责任',
    paragraphs: [
      '门店作为公开内容的发布者，应对所公示的图片与文字自行核对，并承担相应合规责任。',
      '【条款正文待法务定稿后替换。】',
    ],
  },
  {
    heading: '第三条 隐私与脱敏',
    paragraphs: [
      '公开内容不得含有可识别个人或车辆敏感信息的未处理材料，包括但不限于清晰车牌、人脸、完整手机号、车架号等。',
      '【条款正文待法务定稿后替换。】',
    ],
  },
  {
    heading: '第四条 平台工具边界',
    paragraphs: [
      '平台提供的辅助工具（如自动打码）仅供参考，不构成对公开内容零残留或完全合规的保证，亦不代门店承担发布责任。',
      '【条款正文待法务定稿后替换。】',
    ],
  },
  {
    heading: '第五条 同意与生效',
    paragraphs: [
      '门店点击同意即表示已阅读并理解本协议全部条款，并同意按本协议承担责任后继续公开。',
      '【条款正文待法务定稿后替换。】',
    ],
  },
]

module.exports = {
  HOST_PRIVACY_AGREEMENT_VERSION,
  HOST_PRIVACY_AGREEMENT_TITLE,
  HOST_PRIVACY_AGREEMENT_SECTIONS,
}
