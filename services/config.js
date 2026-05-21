/**
 * 接口与环境配置
 * mock：本地演示；dev/prod：接 geo.simplewin.cn API
 */
const ENV = {
  /** @type {'mock' | 'dev' | 'prod'} */
  mode: 'mock',
  /** 联调：'https://geo.simplewin.cn'（须与微信公众平台 request 合法域名一致） */
  baseUrl: 'https://geo.simplewin.cn',
  apiVersion: 'v1',
  clientType: 'user-miniapp',
  appVersion: '0.0.1',
  /** 联调期与 backend/.env DEV_USER_TOKEN 一致 */
  devUserToken: 'dev_user_token_change_me',
}

module.exports = { ENV }
