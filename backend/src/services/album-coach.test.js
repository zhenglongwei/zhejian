const assert = require('assert')
const { resolveAlbumCoach } = require('./album-coach.service')

function run() {
  const chassis = resolveAlbumCoach(
    { serviceName: '宝马底盘异响', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(chassis.servicePackId, 'chassis_noise')
  assert.ok(chassis.uploadInlineHints.length >= 1)

  const brake = resolveAlbumCoach(
    { serviceName: '刹车片更换', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(brake.servicePackId, 'brake')

  const common = resolveAlbumCoach({ serviceName: '其它服务', nodes: [] }, { stageId: 'stage_1' })
  assert.strictEqual(common.servicePackId, 'common')
  assert.ok(common.coachCards.some((c) => c.type === 'avoid'))

  console.log('album-coach.test.js OK')
}

run()
