const { ENV } = require('../services/config')

/** 辙见 H5 内容站根 URL（公开案例 / 门店 / GEO） */
const H5_CONTENT_SITE_URL = (ENV.baseUrl || 'https://geo.simplewin.cn').replace(/\/$/, '')

const H5_CONTENT_SITE_HINT = '链接已复制，请在浏览器中打开'

module.exports = {
  H5_CONTENT_SITE_URL,
  H5_CONTENT_SITE_HINT,
}
