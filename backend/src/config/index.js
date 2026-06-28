require('dotenv').config()

function resolvePublicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) {
    return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '')
  }
  const nodeEnv = process.env.NODE_ENV || 'development'
  if (nodeEnv === 'production') {
    return 'https://geo.simplewin.cn'
  }
  const host = process.env.HOST || '127.0.0.1'
  const port = Number(process.env.PORT || 3000)
  return `http://${host}:${port}`
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  publicBaseUrl: resolvePublicBaseUrl(),
  devAuthEnabled: process.env.DEV_AUTH_ENABLED !== 'false',
  devTokens: {
    user: process.env.DEV_USER_TOKEN || 'dev_user_token_change_me',
    merchant: process.env.DEV_MERCHANT_TOKEN || 'dev_merchant_token_change_me',
    system: process.env.DEV_SYSTEM_TOKEN || 'dev_system_token_change_me',
    admin: process.env.DEV_ADMIN_TOKEN || process.env.DEV_SYSTEM_TOKEN || 'dev_system_token_change_me',
  },
  adminPassword: process.env.ADMIN_PASSWORD || 'admin_change_me',
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
    subscribeTemplates: {
      consult: process.env.WECHAT_TMPL_CONSULT || '',
      album: process.env.WECHAT_TMPL_ALBUM || '',
      audit: process.env.WECHAT_TMPL_AUDIT || '',
      lead: process.env.WECHAT_TMPL_LEAD || '',
    },
    subscribeFields: {
      consult: {
        service: process.env.WECHAT_TMPL_CONSULT_FIELD_SERVICE || 'thing1',
        status: process.env.WECHAT_TMPL_CONSULT_FIELD_STATUS || 'thing2',
        tips: process.env.WECHAT_TMPL_CONSULT_FIELD_TIPS || 'thing6',
      },
      album: {
        service: process.env.WECHAT_TMPL_ALBUM_FIELD_SERVICE || 'thing1',
        status: process.env.WECHAT_TMPL_ALBUM_FIELD_STATUS || 'thing2',
        tips: process.env.WECHAT_TMPL_ALBUM_FIELD_TIPS || 'thing6',
      },
      audit: {
        auditStatus: process.env.WECHAT_TMPL_AUDIT_FIELD_STATUS || 'phrase1',
        caseNo: process.env.WECHAT_TMPL_AUDIT_FIELD_CASE_NO || 'character_string14',
        auditTime: process.env.WECHAT_TMPL_AUDIT_FIELD_TIME || 'date2',
        remark: process.env.WECHAT_TMPL_AUDIT_FIELD_REMARK || 'thing3',
      },
      lead: {
        sender: process.env.WECHAT_TMPL_LEAD_FIELD_SENDER || 'name1',
        leadTime: process.env.WECHAT_TMPL_LEAD_FIELD_TIME || 'time1',
        tips: process.env.WECHAT_TMPL_LEAD_FIELD_TIPS || 'thing2',
      },
    },
  },
  wechatPay: {
    mchId: process.env.WECHAT_PAY_MCH_ID || '',
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || '',
    certSerial: (() => {
      const raw = process.env.WECHAT_PAY_CERT_SERIAL || ''
      return raw.replace(/^serial=/i, '').replace(/:/g, '').trim().toUpperCase()
    })(),
    privateKey: (() => {
      const inline = process.env.WECHAT_PAY_PRIVATE_KEY || ''
      if (inline) return inline.replace(/\\n/g, '\n')
      try {
        const fs = require('fs')
        const keyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH || ''
        if (keyPath && fs.existsSync(keyPath)) {
          return fs.readFileSync(keyPath, 'utf8')
        }
      } catch (e) {
        /* ignore */
      }
      return ''
    })(),
    notifyUrl:
      process.env.WECHAT_PAY_NOTIFY_URL ||
      `${resolvePublicBaseUrl()}/api/v1/pay/wechat/notify`,
    /** 公钥模式：商户平台「微信支付公钥」页的公钥 ID */
    publicKeyId: process.env.WECHAT_PAY_PUBLIC_KEY_ID || '',
    publicKey: (() => {
      const inline = process.env.WECHAT_PAY_PUBLIC_KEY || ''
      if (inline) return inline.replace(/\\n/g, '\n')
      try {
        const fs = require('fs')
        const keyPath = process.env.WECHAT_PAY_PUBLIC_KEY_PATH || ''
        if (keyPath && fs.existsSync(keyPath)) {
          return fs.readFileSync(keyPath, 'utf8')
        }
      } catch (e) {
        /* ignore */
      }
      return ''
    })(),
    /** 联调：设 1 则套餐实付 1 分（仅下单金额，权益仍按套餐） */
    subscriptionTestAmountCents: (() => {
      const raw = process.env.WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS
      if (!raw) return null
      const n = Number(raw)
      return Number.isFinite(n) && n >= 1 ? Math.round(n) : null
    })(),
    get configured() {
      return Boolean(
        this.mchId &&
          this.apiV3Key &&
          this.certSerial &&
          this.privateKey &&
          config.wechat.appId,
      )
    },
    get publicKeyMode() {
      return Boolean(this.publicKeyId && this.publicKey)
    },
  },
  /** MVP：提交入驻后自动通过（运营审核后台就绪后设为 false） */
  merchantAutoApprove: process.env.MERCHANT_AUTO_APPROVE !== 'false',
  /** TEST-ONLY: 允许商家手填车主手机号；测试通过后设为 false 或删除环境变量 */
  merchantOwnerPhoneTest: process.env.MERCHANT_OWNER_PHONE_TEST === 'true',
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
    cacheVersion: process.env.DESENSITIZE_CACHE_VERSION || 'aliyun-v7',
  },
  geoProbe: {
    enabled: process.env.GEO_PROBE_ENABLED === 'true',
    dryRun: process.env.GEO_PROBE_DRY_RUN === 'true',
    /** @deprecated 单引擎遗留；多引擎见 GEO_PROBE_ENGINES */
    apiUrl:
      process.env.GEO_PROBE_API_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: process.env.GEO_PROBE_API_KEY || process.env.DASHSCOPE_API_KEY || '',
    model: process.env.GEO_PROBE_MODEL || 'qwen-plus',
    engine: process.env.GEO_PROBE_ENGINE || 'qwen',
    engines: process.env.GEO_PROBE_ENGINES || process.env.GEO_PROBE_ENGINE || 'qwen',
    timeoutMs: Number(process.env.GEO_PROBE_TIMEOUT_MS || 120000),
    batchLimit: Number(process.env.GEO_PROBE_BATCH_LIMIT || 20),
    /** qwen3.6-plus 等混合思考模型：探测需直接答案，默认关思考 */
    enableThinking: process.env.GEO_PROBE_ENABLE_THINKING === 'true',
  },
  geoLlm: {
    enabled: process.env.GEO_LLM_ENABLED === 'true',
    dryRun: process.env.GEO_LLM_DRY_RUN === 'true',
    apiUrl:
      process.env.GEO_LLM_API_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: process.env.GEO_LLM_API_KEY || process.env.DASHSCOPE_API_KEY || '',
    model: process.env.GEO_LLM_MODEL || 'qwen3.6-plus',
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || 90000),
    enableThinking: process.env.GEO_LLM_ENABLE_THINKING === 'true',
  },
  geoVision: {
    enabled: process.env.GEO_VISION_ENABLED === 'true',
    dryRun: process.env.GEO_VISION_DRY_RUN === 'true',
    apiUrl:
      process.env.GEO_VISION_API_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: process.env.GEO_VISION_API_KEY || process.env.DASHSCOPE_API_KEY || '',
    model: process.env.GEO_VISION_MODEL || 'qwen3.6-plus',
    timeoutMs: Number(process.env.GEO_VISION_TIMEOUT_MS || 90000),
    enableThinking: process.env.GEO_VISION_ENABLE_THINKING === 'true',
  },
}

module.exports = { config }
