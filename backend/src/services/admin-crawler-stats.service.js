const { queryCrawlerUrlStats } = require('./crawler-url-daily.service')

async function getAdminCrawlerStats(query = {}) {
  const stats = await queryCrawlerUrlStats(query)
  return {
    ...stats,
    disclaimer:
      '「爬虫访问」指已知搜索引擎或 AI 爬虫访问公开页次数，不代表 AI 对话中的引用次数。答案引用见 GEO 探测周报。',
  }
}

module.exports = {
  getAdminCrawlerStats,
}
