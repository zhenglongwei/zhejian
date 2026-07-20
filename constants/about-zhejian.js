/**
 * 设置 → 关于辙见
 * 只承载平台身份与边界；操作详解见「使用说明与帮助」
 */

const ABOUT_ZHEJIAN_IDENTITY = {
  heading: '辙见是什么',
  body:
    '辙见提供服务相册查看与授权留痕工具，不是在线交易平台。' +
    '实际维修、报价、收款与售后由门店线下提供和承担；公开案例与门店介绍在 H5 内容站浏览。',
}

/** 一句获相册提示（详细步骤见帮助中心） */
const ABOUT_ZHEJIAN_ALBUM_TIP =
  '门店创建相册后，请用微信「扫一扫」打开门店码或分享链接；登录后可在「我的服务相册」查看。操作细节见「使用说明与帮助」。'

const ABOUT_ZHEJIAN_NOTES = [
  {
    title: '非交易平台',
    desc: '不提供在线支付、订单仲裁或维修质量担保；争议请与门店协商或通过行政/司法途径解决。',
  },
  {
    title: '公开展示在 H5',
    desc: '小程序侧重工具与私域承接；公开案例、门店聚合与专题内容请在 H5 内容站浏览。',
  },
  {
    title: '合规与举报',
    desc: '禁止夸大宣传、虚假价格与未授权公开。用户可举报虚假信息，平台将事后核查处置。',
  },
]

module.exports = {
  ABOUT_ZHEJIAN_IDENTITY,
  ABOUT_ZHEJIAN_ALBUM_TIP,
  ABOUT_ZHEJIAN_NOTES,
}
