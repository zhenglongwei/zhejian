/**
 * GEO-TOPIC-H04 · 运营台批量种子 draft API
 */
const { assertGeoObsPrismaReady } = require('../lib/prisma')
const { batchUpsertGeoPageDrafts } = require('./geo-batch-draft.service')

async function runAdminGeoSeedBatchDraft(body = {}) {
  assertGeoObsPrismaReady()
  const result = await batchUpsertGeoPageDrafts({
    publish: body.publish,
    contentOnly: body.contentOnly,
    dryRun: body.dryRun,
  })

  return {
    disclaimer:
      '批量 draft 仅刷新种子专题内容与 FAQ；默认不将已发布专题降级为草稿。发布须走 H06 审核闸门。',
    ...result,
  }
}

module.exports = {
  runAdminGeoSeedBatchDraft,
}
