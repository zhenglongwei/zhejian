const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * 发版新增 Prisma model 后若未 db:setup:prod，delegate 为 undefined。
 * @param {string} delegateKey 如 userFavorite
 * @param {string} label 日志/错误展示名
 */
function assertPrismaDelegate(delegateKey, label = delegateKey) {
  if (prisma[delegateKey]) return
  const err = new Error(
    `${label} 未就绪：请在 backend 目录执行 npm run db:setup:prod 后 pm2 restart zhejian-api`
  )
  err.status = 503
  err.code = 100503
  throw err
}

/** @param {Array<[string, string?]>|string[]} delegates */
function assertPrismaDelegates(delegates) {
  for (const item of delegates) {
    const key = Array.isArray(item) ? item[0] : item
    const label = Array.isArray(item) ? item[1] || item[0] : item
    assertPrismaDelegate(key, label)
  }
}

/** GEO-OBS 表迁移 + prisma generate 后可用 */
function assertGeoObsPrismaReady() {
  assertPrismaDelegates([
    ['crawlerUrlDaily', 'GEO 爬虫统计（crawler_url_daily）'],
    ['geoPromptProbe', 'GEO Prompt 词库（geo_prompt_probe）'],
    ['geoPromptProbeResult', 'GEO Prompt 探测结果（geo_prompt_probe_result）'],
  ])
}

module.exports = { prisma, assertPrismaDelegate, assertPrismaDelegates, assertGeoObsPrismaReady }
