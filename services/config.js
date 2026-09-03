/**
 * 接口与环境配置
 *
 * 切换环境：改 ACTIVE_ENV
 * - local    开发者工具 + 本机 backend（127.0.0.1:3000）
 * - staging  体验版/真机联调 → staging.geo.simplewin.cn（预发，须微信合法域名）
 * - prod     正式版/体验版 → geo.simplewin.cn（生产）
 * - mock     纯前端演示，不发起 HTTP
 *
 * 域名：geo.simplewin.cn = 生产；staging.geo.simplewin.cn = 预发（API + H5 + /admin/）
 * 提审/正式发版前务必改回 ACTIVE_ENV = 'prod'
 */
const ACTIVE_ENV = 'prod'

const PROFILES = {
  mock: {
    mode: 'mock',
    baseUrl: '',
    apiVersion: 'v1',
    clientType: 'user-miniapp',
    appVersion: '0.0.1',
    adminWebBase: 'https://geo.simplewin.cn/admin',
  },
  local: {
    mode: 'dev',
    baseUrl: 'http://127.0.0.1:3000',
    apiVersion: 'v1',
    clientType: 'user-miniapp',
    appVersion: '0.0.1',
    adminWebBase: 'https://geo.simplewin.cn/admin',
  },
  staging: {
    mode: 'staging',
    baseUrl: 'https://staging.geo.simplewin.cn',
    apiVersion: 'v1',
    clientType: 'user-miniapp',
    appVersion: '0.0.1',
    adminWebBase: 'https://staging.geo.simplewin.cn/admin',
  },
  prod: {
    mode: 'prod',
    baseUrl: 'https://geo.simplewin.cn',
    apiVersion: 'v1',
    clientType: 'user-miniapp',
    appVersion: '0.0.1',
    adminWebBase: 'https://geo.simplewin.cn/admin',
  },
}

const ENV = PROFILES[ACTIVE_ENV] || PROFILES.local

/** TEST-ONLY: 允许商家手填车主手机号；测试通过后改回 false */
const ALLOW_TEST_OWNER_PHONE = true

module.exports = { ENV, ACTIVE_ENV, PROFILES, ALLOW_TEST_OWNER_PHONE }
