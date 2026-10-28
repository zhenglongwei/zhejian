const test = require('node:test')
const assert = require('node:assert/strict')
const { planLegacyPhotoFold, planIntakePhotoDraftFold, planAllPhotoFolds } = require('./flow-node-photos')

test('旧接车图并进接车节点，不新开检测项', () => {
  const nodes = [
    {
      id: 'n1',
      kind: 'intake',
      photoDraft: { chiefComplaint: '异响', mileageKm: '1444', pendingImages: [], findings: [] },
    },
    { id: 'n2', kind: 'inspection', photoDraft: { findings: [], pendingImages: [] } },
  ]
  const stages = [
    {
      id: 'stage_1',
      images: [
        { url: 'https://img.example/a.jpg', id: 'a' },
        { url: 'https://img.example/b.jpg?x=1', id: 'b' },
      ],
    },
  ]
  const next = planLegacyPhotoFold(nodes, stages)
  assert.equal(next[0].photoDraft.pendingImages.length, 2)
  assert.equal(next[0].photoDraft.pendingImages[0].url, 'https://img.example/a.jpg')
  assert.deepEqual(next[0].photoDraft.findings, [])
  assert.equal(next[0].photoDraft.chiefComplaint, '异响')
  assert.equal(next[1].photoDraft.pendingImages.length, 0)
})

test('节点上已有的图不再并一次', () => {
  const nodes = [
    {
      id: 'n1',
      kind: 'intake',
      photoDraft: { pendingImages: [{ url: 'https://img.example/a.jpg' }] },
    },
  ]
  const stages = [{ id: 'stage_1', images: [{ url: 'https://img.example/a.jpg?token=1' }] }]
  assert.equal(planLegacyPhotoFold(nodes, stages), null)
})

test('已经挂在检测项上的图不进未归组', () => {
  const nodes = [
    {
      id: 'n2',
      kind: 'inspection',
      photoDraft: {
        findings: [{ id: 'f1', partName: '下摆臂', images: [{ url: 'https://img.example/arm.jpg' }] }],
        pendingImages: [],
      },
    },
  ]
  const stages = [
    {
      id: 'stage_2',
      images: [
        { url: 'https://img.example/arm.jpg' },
        { url: 'https://img.example/loose.jpg' },
      ],
    },
  ]
  const next = planLegacyPhotoFold(nodes, stages)
  assert.equal(next[0].photoDraft.findings.length, 1)
  assert.equal(next[0].photoDraft.findings[0].images.length, 1)
  assert.equal(next[0].photoDraft.pendingImages.length, 1)
  assert.equal(next[0].photoDraft.pendingImages[0].url, 'https://img.example/loose.jpg')
})

test('交车不从旧阶段并进照片堆', () => {
  const nodes = [{ id: 'n4', kind: 'delivery_photos', photoDraft: { pendingImages: [] } }]
  const stages = [{ id: 'stage_6', images: [{ url: 'https://img.example/out.jpg' }] }]
  assert.equal(planLegacyPhotoFold(nodes, stages), null)
})

test('接车旧袋并进 pendingImages 后清空', () => {
  const nodes = [
    {
      id: 'n1',
      kind: 'intake',
      photoDraft: {
        pendingImages: [{ url: 'https://cdn.example/uploads/a.jpg' }],
        odometerUrl: 'https://cdn.example/uploads/odo.jpg?sig=1',
        odometerImageId: 'odo1',
        intakeResults: [
          {
            category: 'fuel',
            reading: '半箱',
            images: [{ url: 'https://cdn.example/uploads/fuel.jpg' }],
          },
        ],
        findings: [{ partName: '左前', url: 'https://cdn.example/uploads/left.jpg' }],
      },
    },
  ]
  const next = planIntakePhotoDraftFold(nodes)
  assert.ok(next)
  const draft = next[0].photoDraft
  assert.equal(draft.pendingImages.length, 4)
  assert.equal(draft.odometerUrl, '')
  assert.equal(draft.odometerImageId, '')
  assert.deepEqual(draft.findings, [])
  assert.deepEqual(draft.intakeResults, [{ category: 'fuel', reading: '半箱' }])
})

test('合并节点检测 findings 不并进、不清空', () => {
  const nodes = [
    {
      id: 'n1',
      kind: 'intake_inspection',
      photoDraft: {
        pendingImages: [],
        odometerUrl: 'https://cdn.example/uploads/odo.jpg',
        findings: [{ id: 'f1', partName: '下摆臂', images: [{ url: 'https://cdn.example/uploads/arm.jpg' }] }],
      },
    },
  ]
  const next = planIntakePhotoDraftFold(nodes)
  assert.ok(next)
  assert.equal(next[0].photoDraft.pendingImages.length, 1)
  assert.equal(next[0].photoDraft.findings.length, 1)
  assert.equal(next[0].photoDraft.findings[0].id, 'f1')
})

test('旧袋已空时不再改写', () => {
  const nodes = [
    {
      id: 'n1',
      kind: 'intake',
      photoDraft: {
        pendingImages: [{ url: 'https://cdn.example/uploads/a.jpg' }],
        odometerUrl: '',
        intakeResults: [{ category: 'fuel', reading: '半箱' }],
        findings: [],
      },
    },
  ]
  assert.equal(planIntakePhotoDraftFold(nodes), null)
})

test('planAllPhotoFolds 串联阶段并入与旧袋并入', () => {
  const nodes = [
    {
      id: 'n1',
      kind: 'intake',
      photoDraft: {
        pendingImages: [],
        odometerUrl: 'https://cdn.example/uploads/odo.jpg',
        findings: [],
      },
    },
  ]
  const stages = [{ id: 'stage_1', images: [{ url: 'https://cdn.example/uploads/a.jpg', id: 'a' }] }]
  const next = planAllPhotoFolds(nodes, stages)
  assert.ok(next)
  assert.equal(next[0].photoDraft.pendingImages.length, 2)
  assert.equal(next[0].photoDraft.odometerUrl, '')
})
