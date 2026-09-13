const test = require('node:test')
const assert = require('node:assert/strict')
const { assessHostPublicContent } = require('./host-public-content-check')

test('missing mileage and vague complaint become suggestions', () => {
  const result = assessHostPublicContent({
    album: {
      contentPackageJson: {
        flowNodes: [
          {
            kind: 'intake_inspection',
            photoDraft: { chiefComplaint: '定时保养', findings: [] },
          },
          {
            kind: 'inspection_report',
            document: { payload: { chiefComplaint: '定时保养', findings: [] } },
          },
        ],
      },
    },
    view: { vehicle: { brand: '起亚', series: '赛拉图' } },
  })
  const issues = result.suggestions.map((row) => row.issue)
  assert.ok(issues.includes('missing_mileage'))
  assert.ok(issues.includes('vague_complaint'))
})

test('catalog vehicle and qr caption are flagged', () => {
  const result = assessHostPublicContent({
    view: {
      vehicle: { brand: '一汽', series: 'YQ7162(2006.08-) 手动;自动' },
      vehicleDisplay: 'YQ7162(2006.08-)',
    },
    album: {
      vehicleJson: { mileage: 86500 },
      contentPackageJson: {
        flowNodes: [
          {
            kind: 'intake_inspection',
            photoDraft: {
              chiefComplaint: '电瓶亏电打不着',
              mileageKm: '86500',
              findings: [{ partName: '微信码', result: '状态良好', advice: '无需处理' }],
            },
          },
        ],
      },
    },
  })
  const issues = result.suggestions.map((row) => row.issue)
  assert.ok(issues.includes('catalog_vehicle'))
  assert.ok(issues.includes('qr_caption'))
  assert.ok(!issues.includes('missing_mileage'))
  assert.ok(!issues.includes('vague_complaint'))
})

test('geo summary dump and empty faq are flagged', () => {
  const result = assessHostPublicContent({
    view: { vehicle: { brand: '起亚', series: '赛拉图', mileage: 12000 } },
    album: {
      contentPackageJson: {
        flowNodes: [
          {
            kind: 'intake_inspection',
            photoDraft: { chiefComplaint: '电瓶亏电打不着', mileageKm: '12000' },
          },
        ],
      },
    },
    geoDraft: {
      summary: '含过程图片记录',
      faq: [{ q: '做了什么？', a: '' }],
    },
  })
  const issues = result.suggestions.map((row) => row.issue)
  assert.ok(issues.includes('thin_summary'))
  assert.ok(issues.includes('empty_faq'))
})

test('complete facts yield no suggestions', () => {
  const result = assessHostPublicContent({
    view: { vehicle: { brand: '起亚', series: '赛拉图', mileage: 86500 } },
    album: {
      contentPackageJson: {
        flowNodes: [
          {
            kind: 'intake_inspection',
            photoDraft: {
              chiefComplaint: '电瓶亏电打不着',
              mileageKm: '86500',
              findings: [{ partName: '电瓶', result: '需处理', advice: '更换电瓶' }],
            },
          },
        ],
      },
    },
    geoDraft: {
      summary: '长沙 起亚赛拉图 电瓶亏电，到店更换电瓶，质保 1 年。',
      faq: [{ q: '这单做了什么？', a: '更换电瓶，质保 1 年。' }],
    },
  })
  assert.deepEqual(result.suggestions, [])
})
