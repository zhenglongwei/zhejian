/**
 * 门店对外本地信息稽查：城市、地址、坐标、营业时间、对外店名
 *
 *   node scripts/store-nap-smoke.js
 */
require('dotenv').config()
const { listMerchants } = require('../src/services/content.service')

function missingFields(store) {
  const missing = []
  if (!store.name) missing.push('name')
  if (!store.city) missing.push('city')
  if (!store.address) missing.push('address')
  if (store.latitude == null || store.longitude == null) missing.push('geo')
  if (!store.businessHours) missing.push('businessHours')
  return missing
}

async function main() {
  const { list } = await listMerchants({ limit: 0 })
  const official = list.filter((store) => !store.isDemo)
  const demo = list.filter((store) => store.isDemo)
  const incomplete = official
    .map((store) => ({ id: store.id, name: store.name, missing: missingFields(store) }))
    .filter((row) => row.missing.length)

  console.log('[store-nap-smoke]', {
    official: official.length,
    demo: demo.length,
    incompleteOfficial: incomplete.length,
    demoIds: demo.map((store) => store.id),
    incomplete,
  })

  if (incomplete.length) {
    throw new Error(`正式门店本地信息缺项 ${incomplete.length} 家，示范店不计入`)
  }
  console.log('[store-nap-smoke] ok')
}

main().catch((error) => {
  console.error('[store-nap-smoke] failed', error.message)
  process.exit(1)
})
