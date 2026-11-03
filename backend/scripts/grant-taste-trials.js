#!/usr/bin/env node
/**
 * 存量商家一次性赠送 30 天尝鲜试用。
 * 已有 expiresAt（含已过期）或当前仍在有效周期内的不重复赠送。
 *
 * 用法：cd backend && node scripts/grant-taste-trials.js
 */
require('dotenv').config()
const { backfillTasteTrials } = require('../src/services/merchant-subscription.service')
const { prisma } = require('../src/lib/prisma')

async function main() {
  const result = await backfillTasteTrials()
  console.log('[grant-taste-trials]', result)
}

main()
  .catch((err) => {
    console.error('[grant-taste-trials] failed', err)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch (_) {
      /* ignore */
    }
  })
