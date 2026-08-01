/** 与 h5/shared/site-beian.js 同源口径 */
const SPONSOR_NAME = '杭州盈简科技有限公司'
const ICP_NUMBER = '浙ICP备2024092950号-2'
const ICP_QUERY_URL = 'https://beian.miit.gov.cn/'

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderSiteBeianHtml() {
  return (
    `<aside class="h5-site-beian" aria-label="网站备案信息">` +
    `<div class="h5-site-beian__sponsor">主办单位：${escapeHtml(SPONSOR_NAME)}</div>` +
    `<a class="h5-site-beian__link" href="${escapeHtml(ICP_QUERY_URL)}" target="_blank" rel="noopener noreferrer">` +
    `${escapeHtml(ICP_NUMBER)}</a></aside>`
  )
}

module.exports = {
  SPONSOR_NAME,
  ICP_NUMBER,
  ICP_QUERY_URL,
  renderSiteBeianHtml,
}
