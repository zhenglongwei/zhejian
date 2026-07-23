/**
 * PKG-COACH-P1-06 · 规则包覆盖热更新冒烟
 */
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const overridePath = path.join(
  os.tmpdir(),
  `zhejian-coach-override-${Date.now()}.json`,
)
process.env.ALBUM_COACH_OVERRIDE_PATH = overridePath

// 清模块缓存，确保读到新 env
delete require.cache[require.resolve('./album-coach-config.service')]
delete require.cache[require.resolve('./album-coach.service')]

const {
  saveAdminCoachPack,
  resetAdminCoachPack,
  getRuntimeRules,
  listAdminCoachPacks,
} = require('./album-coach-config.service')
const { resolveAlbumCoach } = require('./album-coach.service')

function run() {
  const before = resolveAlbumCoach(
    { serviceName: '宝马底盘异响', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(before.servicePackId, 'chassis_noise')

  saveAdminCoachPack(
    'chassis_noise',
    {
      pack: {
        label: '底盘异响·运营改',
        geoPyramidHint: 'avoid_pitfall',
        stages: {
          stage_2: {
            shoot_prefer: [
              {
                code: 'ops_custom',
                title: '运营定制要拍',
                detail: '热更新验证',
                strength: 'strong',
              },
            ],
            note_hints: [
              {
                title: '备注怎么写',
                example: '运营覆盖后的备注示例',
                bullets: ['热更新'],
              },
            ],
            geo_angle: ['avoid_pitfall'],
          },
        },
      },
    },
    { updatedBy: 'test' },
  )

  assert.ok(fs.existsSync(overridePath))

  const after = resolveAlbumCoach(
    { serviceName: '宝马底盘异响', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(after.servicePackLabel, '底盘异响·运营改')
  const preferCodes = (after.coachCards.find((c) => c.type === 'prefer')?.items || []).map(
    (x) => x.code,
  )
  assert.ok(preferCodes.includes('ops_custom'))
  assert.ok(String(after.notePlaceholder).includes('运营覆盖'))

  const list = listAdminCoachPacks()
  assert.ok(list.packs.some((p) => p.id === 'chassis_noise' && p.hasOverride))

  const runtime = getRuntimeRules()
  assert.ok(runtime.SERVICE_PACKS.chassis_noise.label.includes('运营'))

  resetAdminCoachPack('chassis_noise', { updatedBy: 'test' })
  const restored = resolveAlbumCoach(
    { serviceName: '宝马底盘异响', nodes: [] },
    { stageId: 'stage_2' },
  )
  const restoredCodes = (
    restored.coachCards.find((c) => c.type === 'prefer')?.items || []
  ).map((x) => x.code)
  assert.ok(!restoredCodes.includes('ops_custom'))
  assert.ok(!String(restored.notePlaceholder).includes('运营覆盖'))

  if (fs.existsSync(overridePath)) fs.unlinkSync(overridePath)
  console.log('album-coach-config.test.js OK')
}

run()
