require('dotenv').config()

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'https://geo.simplewin.cn').replace(/\/$/, ''),
  devAuthEnabled: process.env.DEV_AUTH_ENABLED !== 'false',
  devTokens: {
    user: process.env.DEV_USER_TOKEN || 'dev_user_token_change_me',
    merchant: process.env.DEV_MERCHANT_TOKEN || 'dev_merchant_token_change_me',
    system: process.env.DEV_SYSTEM_TOKEN || 'dev_system_token_change_me',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
    get configured() {
      return Boolean(this.appId && this.appSecret)
    },
  },
  /** MVP：提交入驻后自动通过（运营审核后台就绪后设为 false） */
  merchantAutoApprove: process.env.MERCHANT_AUTO_APPROVE !== 'false',
  aliyun: {
    region: process.env.ALIYUN_REGION || 'cn-shanghai',
    /** 文字识别 OCR API（2021-07-07），默认 ocr-api.{region}.aliyuncs.com */
    ocrApiEndpoint: process.env.ALIYUN_OCR_API_ENDPOINT || '',
    /** VIAPI 车牌 OCR（ocr20191230），默认 ocr.{region}.aliyuncs.com */
    viapiOcrEndpoint: process.env.ALIYUN_VIAPI_OCR_ENDPOINT || '',
  },
  desensitize: {
    engine: process.env.DESENSITIZE_ENGINE || 'aliyun',
    apiTimeoutMs: Number(process.env.DESENSITIZE_API_TIMEOUT_MS || 15000),
    maxFaceNumber: Number(process.env.DESENSITIZE_MAX_FACE_NUMBER || 10),
    /** 车辆接车图默认不做人脸检测，避免误检整图 */
    detectFace: process.env.DESENSITIZE_DETECT_FACE === 'true',
    /** ocr-api 在部分 ECS 不可达，默认 viapi（ocr.cn-shanghai） */
    plateProvider: process.env.DESENSITIZE_PLATE_PROVIDER || 'viapi',
    /** 引擎升级时递增，使旧 pre-mask READY 缓存失效 */
    cacheVersion: process.env.DESENSITIZE_CACHE_VERSION || 'aliyun-v6',
  },
}

module.exports = { config }
