/**
 * USER-PUB · 车主社交媒体文案平台
 */

const SOCIAL_PLATFORMS = {
  xiaohongshu: {
    id: 'xiaohongshu',
    label: '小红书',
    maxChars: 1000,
    styleBrief: [
      '口语、分段短、像笔记不是论文',
      '标题可稍有信息点，但不要夸张标题党',
      'emoji 最多 0～2 个，可完全不用',
      '适合「过程记录 + 一点个人感受」，不要攻略腔',
    ].join('；'),
  },
  zhihu: {
    id: 'zhihu',
    label: '知乎',
    maxChars: 1800,
    styleBrief: [
      '偏问答/经验分享：先交代场景，再写过程与注意点',
      '语气冷静一点，少感叹，可承认「非专业仅个人经历」',
      '结构松一点即可，不要写成标准议论文',
      '可提「到店确认」「仅供参考」，但别写成免责声明模板堆砌',
    ].join('；'),
  },
  toutiao: {
    id: 'toutiao',
    label: '今日头条',
    maxChars: 1500,
    styleBrief: [
      '信息流可读：开头一句说清「哪里、修什么」',
      '中间按时间线说过程，句子偏短',
      '可带城市/门店名（若事实有），像本地生活分享',
      '少用网络黑话，也不要官样文章',
    ].join('；'),
  },
  wechat_mp: {
    id: 'wechat_mp',
    label: '微信公众号',
    maxChars: 2000,
    styleBrief: [
      '像一篇短文：有小标题感可用空行分段，但不要「第一章」',
      '语气稳一点，仍是车主视角，不是品牌通稿',
      '可稍完整地交代前因后果，忌空洞升华',
      '文末可写「过程相册已留档」，一句即可',
    ].join('；'),
  },
  douyin: {
    id: 'douyin',
    label: '抖音',
    maxChars: 500,
    styleBrief: [
      '按口播/视频文案写：短句、可出镜念',
      '前 1～2 句抓住「修了啥/为啥记一笔」',
      '中间 3～6 个短分点或短句推进过程',
      '不要长段；不要「家人们谁懂」滥用',
    ].join('；'),
  },
}

const SOCIAL_PLATFORM_LIST = Object.values(SOCIAL_PLATFORMS).map((p) => ({
  id: p.id,
  label: p.label,
}))

function normalizeSocialPlatform(raw) {
  const key = String(raw || '').trim()
  if (SOCIAL_PLATFORMS[key]) return key
  return 'xiaohongshu'
}

module.exports = {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LIST,
  normalizeSocialPlatform,
}
