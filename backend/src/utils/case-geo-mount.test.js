const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildCaseMountItemFromRow,
  mergeTopicMountIds,
  resolveMountVehicleText,
} = require('./case-geo-mount')
const { assertSnapshotPreserved } = require('../services/case-enrichment.service')

test('buildCaseMountItemFromRow prefers snapshot title and enrichment faultDesc', () => {
  const row = {
    id: 'case_1',
    city: '杭州',
    serviceName: 'live服务',
    title: 'live标题',
    summary: 'live摘要',
    contentJson: {
      vehicleText: 'live车辆',
      faultDesc: 'live故障',
      tags: ['authorized'],
      snapshot: {
        version: 1,
        title: '快照标题',
        serviceName: '刹车维修',
        city: '杭州',
        nodes: [],
        geo: { faultDesc: '快照故障' },
        vehicle: { brand: '宝马', series: '3系' },
      },
    },
    enrichmentJson: {
      version: 2,
      aiSummary: '提炼层摘要',
      geo: { faultDesc: '提炼层故障描述' },
    },
  }

  const item = buildCaseMountItemFromRow(row, null)
  assert.equal(item.title, '快照标题')
  assert.equal(item.serviceName, '刹车维修')
  assert.equal(item.summary, '提炼层摘要')
  assert.equal(item.faultDesc, '提炼层故障描述')
  assert.equal(item.vehicleText, 'live车辆')
})

test('resolveMountVehicleText falls back to snapshot vehicle', () => {
  const text = resolveMountVehicleText(
    {},
    {
      vehicle: { brand: '奥迪', series: 'A4' },
    }
  )
  assert.equal(text, '奥迪A4（已脱敏）')
})

test('mergeTopicMountIds preserves existing mounts', () => {
  assert.deepEqual(mergeTopicMountIds(['geo_a', 'geo_b'], ['geo_b', 'geo_c']), [
    'geo_a',
    'geo_b',
    'geo_c',
  ])
})

test('assertSnapshotPreserved rejects snapshot mutation', () => {
  const before = {
    snapshot: {
      version: 1,
      title: '原样',
      nodes: [{ id: 'stage_1', title: '接车', note: '说明', images: [] }],
    },
    geo: { faultDesc: '旧' },
  }
  const after = {
    snapshot: {
      version: 1,
      title: '被改',
      nodes: [{ id: 'stage_1', title: '接车', note: '说明', images: [] }],
    },
    geo: { faultDesc: '新' },
  }
  assert.throws(() => assertSnapshotPreserved(before, after), /不可修改案例快照/)
})

test('assertSnapshotPreserved allows geo-only mirror update', () => {
  const before = {
    snapshot: {
      version: 1,
      title: '原样',
      nodes: [],
    },
    geo: { faultDesc: '旧' },
  }
  const after = {
    snapshot: {
      version: 1,
      title: '原样',
      nodes: [],
    },
    geo: { faultDesc: '新', publishedH5At: '2026-07-09T00:00:00.000Z' },
  }
  assert.doesNotThrow(() => assertSnapshotPreserved(before, after))
})
