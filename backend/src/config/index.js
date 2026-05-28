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
}

module.exports = { config }
