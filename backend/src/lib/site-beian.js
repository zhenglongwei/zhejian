/** 与 h5/shared/site-beian.js 同源口径 */
const SPONSOR_NAME = '杭州盈简科技有限公司'
const ICP_NUMBER = '浙ICP备2024092950号-2'
const ICP_QUERY_URL = 'https://beian.miit.gov.cn/'
const FOOTER_NOTE = '本页内容仅供参考。实际方案与费用请与门店线下确认。'

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
    `<a class="h5-site-beian__link" href="${escapeHtml(ICP_QUERY_URL)}" target="_blank" rel="noopener noreferrer">` +
    `${escapeHtml(ICP_NUMBER)}</a>` +
    `<div class="h5-site-beian__sponsor">开发者：${escapeHtml(SPONSOR_NAME)}</div>` +
    `<p class="h5-site-footer__note">${escapeHtml(FOOTER_NOTE)}</p>` +
    `</aside>`
  )
}

module.exports = {
  SPONSOR_NAME,
  ICP_NUMBER,
  ICP_QUERY_URL,
  FOOTER_NOTE,
  renderSiteBeianHtml,
}
