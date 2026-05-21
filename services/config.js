/**
 * 接口与环境配置
 * mock：本地演示；dev/prod：接 geo.simplewin.cn API
 *
 * 域名说明（盈简科技 / 辙见）：
 * - simplewin.cn：公司官网，独立部署
 * - geo.simplewin.cn：辙见 API + SEO/GEO + 运营后台 /admin/
 */
const ENV = {
  /** @type {'mock' | 'dev' | 'prod'} */
  mode: 'mock',
  /** 辙见 API 根地址（须与微信 request 合法域名一致，不含 /api 路径） */
  baseUrl: 'https://geo.simplewin.cn',
  apiVersion: 'v1',
  clientType: 'user-miniapp',
  appVersion: '0.0.1',
  /** 联调期与 backend/.env DEV_USER_TOKEN 一致 */
  devUserToken: 'dev_user_token_change_me',
  /** 运营后台 Web 根路径（未来 admin-web） */
  adminWebBase: 'https://geo.simplewin.cn/admin',
}

module.exports = { ENV }
