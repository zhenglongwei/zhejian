const SHARE_MODE = {
  DESENSITIZED: 'desensitized',
  ORIGINAL: 'original',
}

const SHARE_CHANNEL = {
  WECHAT: 'wechat',
  LINK: 'link',
  OWNER_H5_LINK: 'owner_h5_link',
  PUBLIC_H5_LINK: 'public_h5_link',
}

const ORIGINAL_SHARE_RISK =
  '原图可能包含车牌、手机号、人脸等隐私信息。分享给他人后，已传播内容无法撤回。请确认你已了解风险并仍希望使用原图分享。'

const OWNER_SHARE_TITLE_SUFFIX = ' · 服务过程参考'

module.exports = {
  SHARE_MODE,
  SHARE_CHANNEL,
  ORIGINAL_SHARE_RISK,
  OWNER_SHARE_TITLE_SUFFIX,
}
