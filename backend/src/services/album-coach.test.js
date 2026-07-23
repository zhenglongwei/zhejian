const assert = require('assert')
const { resolveAlbumCoach } = require('./album-coach.service')

function noteOf(coach) {
  return String(coach.notePlaceholder || '')
}

function preferTitles(coach) {
  const card = (coach.coachCards || []).find((c) => c.type === 'prefer')
  return (card?.items || []).map((x) => x.title)
}

function run() {
  const chassis = resolveAlbumCoach(
    { serviceName: '宝马底盘异响', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(chassis.servicePackId, 'chassis_noise')
  assert.ok(noteOf(chassis).includes('胶套'))
  assert.ok(chassis.uploadInlineHints.length >= 1)

  const brake = resolveAlbumCoach(
    { serviceName: '刹车片更换', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(brake.servicePackId, 'brake')

  const common = resolveAlbumCoach({ serviceName: '其它服务', nodes: [] }, { stageId: 'stage_1' })
  assert.strictEqual(common.servicePackId, 'common')
  assert.ok(common.coachCards.some((c) => c.type === 'avoid'))
  assert.ok(!noteOf(common).includes('减速带'))
  assert.ok(!noteOf(common).includes('胶套'))

  const paint = resolveAlbumCoach(
    { serviceName: '比亚迪秦钣喷', templateId: 'body_paint', nodes: [] },
    { stageId: 'stage_2' },
  )
  assert.strictEqual(paint.servicePackId, 'body_paint')
  assert.ok(noteOf(paint).includes('补漆') || noteOf(paint).includes('划痕'))
  assert.ok(!noteOf(paint).includes('胶套'))
  assert.ok(!noteOf(paint).includes('减速带'))
  assert.ok(preferTitles(paint).some((t) => t.includes('损伤')))
  assert.ok(!preferTitles(paint).some((t) => t.includes('扭矩')))

  const paint1 = resolveAlbumCoach(
    { templateId: 'body_paint', serviceName: '钣喷修复', nodes: [] },
    { stageId: 'stage_1' },
  )
  assert.ok(noteOf(paint1).includes('划痕') || noteOf(paint1).includes('前门'))
  assert.ok(!noteOf(paint1).includes('减速带'))

  const paint5 = resolveAlbumCoach(
    { templateId: 'body_paint', nodes: [] },
    { stageId: 'stage_5' },
  )
  assert.ok(preferTitles(paint5).some((t) => t.includes('遮蔽') || t.includes('工序')))
  assert.ok(!preferTitles(paint5).some((t) => t.includes('扭矩')))

  console.log('album-coach.test.js OK')
}

run()
